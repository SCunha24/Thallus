class MQTTClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.broker = 'wss://broker.emqx.io:8084';
    this.topic = 'coimbra/sensores';
    this.onReading = null;            // chamada a cada leitura recebida
    this.onConnectionChange = null;   // chamada ao ligar/desligar
  }

  // Ligar ao broker
  async connect() {
    this.client = mqtt.connect(this.broker, {
      clientId: 'urbansense_' + Math.random().toString(36).substr(2, 9),
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 3000
    });

    return new Promise((resolve, reject) => {
      this.client.on('connect', () => {
        console.log('[MQTT] Ligado ao broker');
        this.isConnected = true;
        this.subscribe();
        if (this.onConnectionChange) this.onConnectionChange(true);
        resolve();
      });

      // Processar a mensagem recebida 
      this.client.on('message', (topic, message) => {
        try {
          const data = JSON.parse(message.toString());
          this.normalizeReadings(data).forEach((reading) => {
            if (this.onReading) this.onReading(reading);
          });
        } catch (err) {
          console.error('[MQTT] Erro ao processar mensagem:', err.message);
        }
      });

      this.client.on('error', (err) => {
        console.error('[MQTT] Erro:', err.message);
        this.isConnected = false;
        if (this.onConnectionChange) this.onConnectionChange(false);
        reject(err);
      });

      this.client.on('close', () => {
        if (this.isConnected) {
          this.isConnected = false;
          if (this.onConnectionChange) this.onConnectionChange(false);
        }
      });

      setTimeout(() => reject(new Error('Timeout na ligação MQTT')), 8000);
    });
  }


  normalizeReadings(data) {
    if (!data || typeof data !== 'object') return [];

    if (Array.isArray(data.locations)) {
      return data.locations;
    }

    // Extrair sempre a leitura mais recente de cada local
    if (data.locations && typeof data.locations === 'object') {
      return Object.entries(data.locations).map(([name, value]) => {
        const reading = Array.isArray(value) ? value[value.length - 1] : value;
        return { name, ...reading };
      });
    }

    if (data.name || data.sensors) {
      return [data];
    }

    return [];
  }

  // Subscrever ao tópico depois de estabelecer ligação 
  subscribe() {
    if (!this.client) return;
    this.client.subscribe(this.topic, (err) => {
      if (err) {
        console.error('[MQTT] Falha ao subscrever:', err.message);
      } else {
        console.log('[MQTT] Subscrito a: ' + this.topic);
      }
    });
  }

  // Terminar a ligação ao broker
  disconnect() {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
    }
  }
}

const mqttClient = new MQTTClient();
