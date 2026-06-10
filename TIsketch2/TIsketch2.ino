#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Adafruit_NeoPixel.h>
#include <ESP_I2S.h>

// FITA LEDS
#define LED_PIN 13
#define NUM_LEDS 30
#define MAX_BRIGHTNESS 200

// DHT, LDR, MQ-9
#define DHTPIN 25
#define DHTTYPE DHT22
#define LDR_PIN 34
#define MQ9_PIN 35

// INMP441 (microfone) -> I2S
#define I2S_WS 26
#define I2S_SCK 33
#define I2S_SD 32
#define I2S_SAMPLE_RATE 16000  //16kHz amostras por segundo
#define I2S_BUFFER_SIZE 1024   //Nr amostras lidas de uma vez
#define NOISE_SHIFT 14
#define NOISE_MAX 100000.0

// Conexão WiFi e MQTT
const char *ssid = "Galaxy A13 5G03E0";
const char *password = "xtgc6579";
const char *mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char *mqtt_topic = "coimbra/sensores";

DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);
Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);
I2SClass i2s;

//  COR SIMPLES
struct Color {
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

//  UTILS
float clampRange(float v, float lo, float hi) {  // limitar intervalos
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

uint8_t clampToRGB(int v) {  // limitar entre 0 e 255
  if (v < 0) return 0;
  if (v > 255) return 255;
  return (uint8_t)v;
}

// Analog-to-Digital conversor
void setup_adc() {
  analogReadResolution(12);
  analogSetPinAttenuation(LDR_PIN, ADC_11db);
  analogSetPinAttenuation(MQ9_PIN, ADC_11db);
}

//  TEMPERATURA - Cor base
struct ColorPoint {
  float temp;
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

ColorPoint tempPoints[] = {
  { 0.0, 0, 60, 255 },      // azul escuro
  { 12.0, 0, 120, 255 },    // azul
  { 18.0, 0, 220, 255 },    // ciano
  { 22.0, 255, 230, 100 },  // amarelo
  { 27.0, 255, 120, 0 },    // laranja
  { 35.0, 255, 20, 0 }      // vermelho
};

const int NUM_TEMP_POINTS = sizeof(tempPoints) / sizeof(tempPoints[0]);

Color temperatureToColor(float t) {
  // Antes do primeiro ponto
  if (t <= tempPoints[0].temp) {
    return { tempPoints[0].r, tempPoints[0].g, tempPoints[0].b };
  }
  // Depois do último ponto
  if (t >= tempPoints[NUM_TEMP_POINTS - 1].temp) {
    ColorPoint p = tempPoints[NUM_TEMP_POINTS - 1];
    return { p.r, p.g, p.b };
  }
  // Encontrar o intervalo e interpolar
  for (int i = 0; i < NUM_TEMP_POINTS - 1; i++) {
    ColorPoint a = tempPoints[i];
    ColorPoint b = tempPoints[i + 1];
    if (t >= a.temp && t <= b.temp) {
      float f = (t - a.temp) / (b.temp - a.temp);
      uint8_t r = clampToRGB((int)(a.r + f * (b.r - a.r)));
      uint8_t g = clampToRGB((int)(a.g + f * (b.g - a.g)));
      uint8_t bl = clampToRGB((int)(a.b + f * (b.b - a.b)));
      return { r, g, bl };
    }
  }
  return { 0, 0, 0 };
}


//  LDR - Sensibilidade global
float getSensitivity(int light) {
  float norm = clampRange(light / 4095.0, 0.0, 1.0);
  return 0.7 + norm * 1.1;
}

//  POLUIÇÃO - LEDs mortos
bool ledAlive[NUM_LEDS];
unsigned long lastDeadUpdate = 0;

void updateDeadLeds(int gas, float sensitivity) {
  unsigned long now = millis();
  if (now - lastDeadUpdate < 3000) return;  //  Atualiza de 3 em 3s
  lastDeadUpdate = now;

  float poluicao = clampRange((gas / 4095.0) * sensitivity, 0.0, 1.0);

  for (int i = 0; i < NUM_LEDS; i++) {
    float r = (float)random(1000) / 1000.0;
    ledAlive[i] = (r >= poluicao);  // probabilidade de morrer
  }
}


//  RUÍDO - Pulsação
float pulsePhase = 0.0;
unsigned long lastPulseTime = 0;

float getPulse(float noise) {
  unsigned long now = millis();
  float dt = (now - lastPulseTime) / 1000.0;
  if (dt > 0.2) dt = 0.2;  //se o loop atrasar
  lastPulseTime = now;

  // Velocidade e amplitude crescem com o ruído
  float speed = 2.0 + noise * 12.0;  // rad/s
  float amplitude = noise * 0.85;    // 0 = sem pulsação

  pulsePhase += speed * dt;
  if (pulsePhase > TWO_PI) pulsePhase -= TWO_PI;

  float onda = 0.5 + 0.5 * sin(pulsePhase);
  return clampRange(1.0 - amplitude + amplitude * onda, 0.0, 1.0);
}


//  RENDER — juntar tudo num frame
void renderFrame(Color base, float humidity, float noise, float sensitivity) {
  // Ruído controla a pulsação 
  float noiseEff = clampRange(noise * sensitivity, 0.0, 1.0);
  float pulse = getPulse(noiseEff);

  // Brilho de cada LED
  float bright[NUM_LEDS];
  for (int i = 0; i < NUM_LEDS; i++) {
    if (ledAlive[i]) {
      bright[i] = pulse;  //vivo pulsa
    } else {
      bright[i] = 0.0f;  //morto fica a 0
    }
  }

  // HUMIDADE - Saturação
  float saturation = clampRange((humidity / 100.0f) * 0.85f, 0.0f, 0.85f);

  uint8_t r = clampToRGB((int)(base.r * (1.0f - saturation) + 255 * saturation));
  uint8_t g = clampToRGB((int)(base.g * (1.0f - saturation) + 255 * saturation));
  uint8_t bl = clampToRGB((int)(base.b * (1.0f - saturation) + 255 * saturation));

  Color baseEff = { r, g, bl };

  for (int i = 0; i < NUM_LEDS; i++) {
    if (!ledAlive[i]) {
      strip.setPixelColor(i, 0, 0, 0);
      continue;
    }

    float b = clampRange(bright[i], 0.0, 1.0);

    uint8_t r = clampToRGB((int)(baseEff.r * b));
    uint8_t g = clampToRGB((int)(baseEff.g * b));
    uint8_t bl = clampToRGB((int)(baseEff.b * b));

    strip.setPixelColor(i, r, g, bl);
  }

  strip.show();
}

//  MICROFONE
void setup_microphone() {
  Serial.println("[I2S] a configurar microfone...");
  i2s.setPins(I2S_SCK, I2S_WS, -1, I2S_SD);

  if (!i2s.begin(I2S_MODE_STD, I2S_SAMPLE_RATE, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO, I2S_STD_SLOT_LEFT)) {
    Serial.println("[I2S] Falha a iniciar o microfone");
    return;
  }
}

float readMicrophoneNoise() {
  int32_t samples[I2S_BUFFER_SIZE];
  size_t bytes_read = i2s.readBytes((char *)samples, sizeof(samples));
  int64_t sum = 0;
  int count = bytes_read / sizeof(int32_t);

  if (count <= 0) return 0.0;

  for (int i = 0; i < count; i++) {
    sum += abs(samples[i] >> NOISE_SHIFT);
  }

  float raw = (float)(sum / count);
  float normalized = raw / NOISE_MAX;
  normalized = clampRange(normalized * 8.0f, 0.0, 1.0);
  return powf(normalized, 0.38f);
}


//  WIFI / MQTT
void setup_wifi() {
  Serial.println("[WIFI] a ligar...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("[WIFI] conectado");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("[WIFI] sem ligação");
  }
}

void reconnectMQTT() {
  if (!client.connected()) {
    String id = "ESP32-" + String(random(0xffff), HEX);
    client.connect(id.c_str());
  }
}


void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  randomSeed((uint32_t)micros());

  strip.begin();
  strip.setBrightness(MAX_BRIGHTNESS);
  strip.clear();
  strip.show();

  for (int i = 0; i < NUM_LEDS; i++) ledAlive[i] = true;

  dht.begin();
  setup_adc();
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  setup_microphone();

  lastPulseTime = millis();
}


void loop() {
  float noise = readMicrophoneNoise();

  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
  }

  if (!client.connected()) reconnectMQTT();
  client.loop();

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int light = analogRead(LDR_PIN);
  int gas = analogRead(MQ9_PIN);

  if (isnan(t) || isnan(h)) {
    delay(100);
    return;
  }

  float sensitivity = getSensitivity(light);
  Color base = temperatureToColor(t);

  updateDeadLeds(gas, sensitivity);
  renderFrame(base, h, noise, sensitivity);

  Serial.printf("t=%.1f h=%.1f gas=%d light=%d noise=%.4f sens=%.2f\n",
                t, h, gas, light, noise, sensitivity);

  static unsigned long lastPublish = 0;
  if (millis() - lastPublish >= 5000) {  // Mandar para o broker a cada 5s
    lastPublish = millis();

    StaticJsonDocument<256> doc;
    JsonArray locations = doc.createNestedArray("locations");
    JsonObject loc = locations.createNestedObject();
    loc["id"] = "L17312123412";
    loc["name"] = "Santa Clara";
    JsonObject sensors = loc.createNestedObject("sensors");
    sensors["temperature"] = t;
    sensors["humidity"] = h;
    sensors["airQuality"] = gas;
    sensors["noise"] = noise;
    sensors["light"] = light;

    char buf[512];
    size_t len = serializeJson(doc, buf, sizeof(buf));
    client.publish(mqtt_topic, (const uint8_t *)buf, len);
  }

  delay(60);
}