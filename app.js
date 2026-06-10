class App {
  async init() {
    console.log('A iniciar...');

    try {
      await dataManager.loadLocations();
      console.log('Dados carregados dos ficheiros');

      uiController.bindModeButtons();
      this.updateClock();
      setInterval(() => this.updateClock(), 60000);

      if (dataManager.locations.length > 0) {
        uiController.selectLocation(dataManager.locations[0].id);
      }

      playbackManager.onPlaybackUpdate = () => uiController.render();

      // Playback dos ficheiros sempre a correr
      // locais com dados ao vivo sobrepõem 
      playbackManager.start();

      this.tryConnectMQTT();

      uiController.render();
    } catch (err) {
      console.error('Erro de inicialização:', err);
    }
  }

  tryConnectMQTT() {
    // Cada leitura ao vivo marca o seu local como "live"
    mqttClient.onReading = (reading) => {
      const location = dataManager.applyLiveReading(reading);
      if (location) {
        uiController.updateConnectionStatus(true);
        uiController.render();
      }
    };

    // Se a ligação falhar, usa os ficheiros 
    mqttClient.onConnectionChange = (isConnected) => {
      if (!isConnected) {
        dataManager.clearLive();
        uiController.updateConnectionStatus(false);
        uiController.render();
      }
    };

    mqttClient.connect().catch((err) => {
      console.warn('MQTT indisponível, a usar ficheiros:', err.message);
      uiController.updateConnectionStatus(false);
    });
  }

  updateClock() {
    uiController.updateClock();
  }

  destroy() {
    playbackManager.stop();
    mqttClient.disconnect();
  }
}

let app;

document.addEventListener('DOMContentLoaded', () => {
  app = new App();
  app.init();
});

window.addEventListener('beforeunload', () => {
  if (app) app.destroy();
});
