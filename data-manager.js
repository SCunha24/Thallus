class DataManager {
  constructor() {
    this.locations = [];
    this.locationsConfigUrl = '/data/locations.json';
    this.thresholds = {
      temperature: { dangerousBelow: 0,   uncomfortableBelow: 10, uncomfortableAbove: 35, dangerousAbove: 40   },
      humidity:    { dangerousBelow: 15,  uncomfortableBelow: 25, uncomfortableAbove: 75, dangerousAbove: 90   },
      co:          { uncomfortableAbove: 50, dangerousAbove: 200  },
      sound:       { uncomfortableAbove: 65, dangerousAbove: 85   },
      light:       { dangerousBelow: 10,  uncomfortableBelow: 100, uncomfortableAbove: 3000, dangerousAbove: 4500 }
    };
  }

  async loadLocations() {
    const response = await fetch(this.locationsConfigUrl);

    if (!response.ok) {
      throw new Error(`Falha ao carregar ${this.locationsConfigUrl}`);
    }

    const config = await response.json();
    const locations = Array.isArray(config) ? config : config.locations;

    this.locations = locations.map((loc) => ({
      ...loc,
      sensors: {
        temperature: 0,
        humidity: 0,
        co: 0,
        sound: 0,
        light: 0
      },
      lastUpdate: new Date()
    }));

    // Carregar dados dos ficheiros para cada local
    for (const location of this.locations) {
      await this.loadCollectedDataForLocation(location.name);
    }

    return this.locations;
  }

  sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  async loadCollectedDataForLocation(locationName) {
    try {
      const filename = this.sanitizeFilename(locationName);
      const url = `/collected-data/${filename}.json`;

      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`[DataManager] Ficheiro não encontrado (404): ${url}`);
        return;
      }

      const data = await response.json();

      if (!data.readings || data.readings.length === 0) {
        console.warn(`[DataManager] Nenhuma leitura encontrada em ${filename}.json`);
        return;
      }

      // Encontrar o local e guardar todas as leituras
      const location = this.locations.find(l => l.name === locationName);
      if (location) {
        // Guardar o array completo de leituras
        location.readings = data.readings;

        // Primeira leitura para os valores iniciais
        const firstReading = data.readings[0];
        const sensors = firstReading.sensors || firstReading;

        location.sensors = this.convertSensors(sensors);
        location.lastUpdate = new Date(firstReading.timestamp);
      }
    } catch (err) {
      console.error(`[DataManager] Erro ao carregar ${locationName}:`, err.message);
    }
  }

  convertSensors(raw) {
    const noise = raw.noise || 0;
    return {
      temperature: raw.temperature || 0,
      humidity:    raw.humidity    || 0,
      // Conversões dos valores
      co:    Math.round((raw.airQuality || 0) / 4095 * 500),
      sound: Math.round(35 + noise * 45),
      light: Math.round((raw.light || 0) / 4095 * 5000)
    };
  }

  classifyLocation(sensors) {
    let score = 0;

    const check = (value, t) => {
      if ((t.dangerousBelow !== undefined && value < t.dangerousBelow) ||
          (t.dangerousAbove !== undefined && value > t.dangerousAbove)) {
        score = 2;
      } else if ((t.uncomfortableBelow !== undefined && value < t.uncomfortableBelow) ||
                 (t.uncomfortableAbove !== undefined && value > t.uncomfortableAbove)) {
        score = Math.max(score, 1);
      }
    };

    check(sensors.temperature, this.thresholds.temperature);
    check(sensors.humidity,    this.thresholds.humidity);
    check(sensors.co,          this.thresholds.co);
    check(sensors.sound,       this.thresholds.sound);
    check(sensors.light,       this.thresholds.light);

    return ['normal', 'uncomfortable', 'dangerous'][score];
  }

  applyLiveReading(reading) {
    if (!reading) return null;

    const name = reading.name;
    const location = this.locations.find(l => l.name === name || l.id === reading.id);
    if (!location) return null;

    const raw = reading.sensors || reading;
    location.sensors = this.convertSensors(raw);
    location.lastUpdate = new Date(reading.timestamp || Date.now());
    location.isLive = true;

    // Acumular histórico ao vivo para os gráficos do modo detalhado
    if (!location.liveReadings) location.liveReadings = [];
    location.liveReadings.push({ timestamp: location.lastUpdate.toISOString(), sensors: raw });
    if (location.liveReadings.length > 120) location.liveReadings.shift();

    return location;
  }

  // Tirar do estado live
  clearLive() {
    this.locations.forEach(location => {
      location.isLive = false;
      location.liveReadings = [];
    });
  }

  // Se for live usa essas leituras
  getReadings(location) {
    return (location.isLive ? location.liveReadings : location.readings) || [];
  }

  getLocationById(id) {
    return this.locations.find(l => l.id === id);
  }

  getAllLocations() {
    return this.locations;
  }

  getLocationStatus(id) {
    const location = this.getLocationById(id);
    if (!location) return null;
    return this.classifyLocation(location.sensors);
  }
}

const dataManager = new DataManager();
