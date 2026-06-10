class PlaybackManager {
  constructor() {
    this.isPlaying = false;
    this.playbackIndex = 0;
    this.playbackInterval = null;
    this.playbackSpeed = 5000; // 5 segundos por leitura
    this.onPlaybackUpdate = null;
  }

  // Iniciar playback
  start() {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.playbackIndex = 0;
    console.log('[Playback] Iniciado');

    this.updateAllLocations();

    this.playbackInterval = setInterval(() => {
      this.advance();
    }, this.playbackSpeed);
  }

  // Parar playback
  stop() {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
    console.log('[Playback] Parado');
  }

  // Avançar para próxima leitura
  advance() {
    // Verificar se algum local tem leituras
    const maxReadings = Math.max(
      ...dataManager.locations.map((loc) => (loc.readings ? loc.readings.length : 0))
    );

    if (maxReadings === 0) return;

    this.playbackIndex = (this.playbackIndex + 1) % maxReadings;
    this.updateAllLocations();
  }

  // Atualizar os locais com a leitura atual
  updateAllLocations() {
    dataManager.locations.forEach((location) => {
      // Se tiver dados live retorna logo
      if (location.isLive) return;

      if (location.readings && location.readings.length > 0) {
        const reading = location.readings[this.playbackIndex % location.readings.length];
        const sensors = reading.sensors || reading;

        location.sensors = dataManager.convertSensors(sensors);
        location.lastUpdate = new Date(reading.timestamp);
      }
    });

    // Callback para carregar a UI
    if (this.onPlaybackUpdate) {
      this.onPlaybackUpdate();
    }
  }

  setSpeed(milliseconds) {
    this.playbackSpeed = milliseconds;
    if (this.isPlaying) {
      this.stop();
      this.start();
    }
  }

  getStatus() {
    return {
      isPlaying: this.isPlaying,
      currentIndex: this.playbackIndex,
      speed: this.playbackSpeed
    };
  }
}

const playbackManager = new PlaybackManager();
