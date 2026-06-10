class UIController {
  constructor() {
    this.currentMode = 'overview';
    this.selectedLocationId = null;
  }

  // Mudar para o modo de visualização selecionado
  switchMode(mode) {
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.remove('active');
    });
    document.getElementById(`${mode}-view`).classList.add('active');
    this.currentMode = mode;
    this.render();
  }

  // Renderizar os pinos no mapa 
  renderMarkers(containerId, locations, clickable = true, showImage = false, onSelect = null) {
    const markersContainer = document.getElementById(containerId);
    if (!markersContainer) return;

    markersContainer.innerHTML = '';

    locations.forEach(location => {
      const status = dataManager.classifyLocation(location.sensors);
      const marker = document.createElement('div');
      marker.className = `marker ${status}`;
      marker.setAttribute('data-location-id', location.id);
      marker.style.left = location.x + '%';
      marker.style.top = location.y + '%';

      if (this.selectedLocationId === location.id) {
        marker.classList.add('highlighted');
      }

      // Imagem dos pinos - só no modo detalhado 
      const imageHtml = (showImage && location.image && this.selectedLocationId === location.id)
        ? `<div class="marker-image-wrap"><img src="${location.image}" alt="${location.name}" class="marker-image"><span class="marker-image-name">${location.name}</span></div>`
        : '';

      marker.innerHTML = `
        ${imageHtml}
        <div class="marker-inner">
          <svg class="marker-pin" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M35 0V69.029" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
            <path d="M0 34.0145L69.029 34.0145" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
            <path d="M11 10.0145L59.8109 58.8254" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
            <path d="M59.8109 10.0145L11.0001 58.8254" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
          </svg>
          <div class="marker-pulse"></div>
        </div>
        <div class="marker-label">${location.name}</div>
      `;

      const pinElement = marker.querySelector('.marker-pin');
      if (this.selectedLocationId === location.id) {
        pinElement.style.color = '#1E3A6E';
      } else {
        pinElement.style.color = '#D4891A';
      }

      if (clickable) {
        marker.addEventListener('click', () => {
          this.selectLocation(location.id);
          this.updateMarkerHighlight();
          if (onSelect) onSelect(location.id);
        });
      }

      markersContainer.appendChild(marker);
    });
  }

  // Atualizar cor, destaque e imagem de todos os pinos
  updateMarkerHighlight() {
    document.querySelectorAll('.marker').forEach(marker => {
      const locId = marker.getAttribute('data-location-id');
      const pinElement = marker.querySelector('.marker-pin');
      const imageWrap = marker.querySelector('.marker-image-wrap');

      if (locId === this.selectedLocationId) {
        marker.classList.add('highlighted');
        pinElement.style.color = '#1E3A6E';
        if (this.currentMode === 'detailed') {
          if (imageWrap) {
            imageWrap.style.display = 'flex';
          } else {
            // Mandar a imagem para o DOM na seleção do pino
            const location = dataManager.getLocationById(locId);
            if (location && location.image) {
              const wrap = document.createElement('div');
              wrap.className = 'marker-image-wrap';
              wrap.innerHTML = `<img src="${location.image}" alt="${location.name}" class="marker-image"><span class="marker-image-name">${location.name}</span>`;
              marker.insertBefore(wrap, marker.firstChild);
            }
          }
        }
      } else {
        marker.classList.remove('highlighted');
        pinElement.style.color = '#D4891A';
        if (imageWrap) imageWrap.style.display = 'none';
      }
    });
  }

  // Renderizar vista geral
  renderOverview(locations) {
    this.renderMarkers('markers', locations, true, false, (id) => {
      this.updateCardHighlight();
      const target = document.querySelector(`.info-card[data-location-id="${id}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    this.renderInfoPanel(locations);
  }

  // Painel lateral da vista geral
  renderInfoPanel(locations) {
    const panel = document.getElementById('infoPanel');

    if (panel.children.length === 0) {
      panel.innerHTML = '';
      locations.forEach(location => {
        const status = dataManager.classifyLocation(location.sensors);
        const card = document.createElement('div');
        card.className = 'info-card';
        card.setAttribute('data-location-id', location.id);

        const imageHtml = location.image ? `<img src="${location.image}" alt="${location.name}" class="info-card-image">` : '';

        card.innerHTML = `
          <div class="info-card-content">
            <div class="info-card-name">${location.name}</div>
            <div class="info-card-status ${status}">
              ${status === 'normal' ? 'Normal' : status === 'uncomfortable' ? 'Desconfortável' : 'Perigoso'}
            </div>
          </div>
          ${imageHtml}
        `;

        card.addEventListener('click', () => {
          this.selectLocation(location.id);
          this.updateCardHighlight();
          this.updateMarkerHighlight();
        });

        panel.appendChild(card);
      });
    } else {
      // Atualizar o destaque(bordas)
      this.updateCardHighlight();
    }
  }

  // Atualizar a borda ativa 
  updateCardHighlight() {
    document.querySelectorAll('.info-card').forEach(card => {
      const locId = card.getAttribute('data-location-id');
      if (locId === this.selectedLocationId) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  // Modo comparação - destacar card e fazer scroll
  highlightComparisonCard(id) {
    document.querySelectorAll('.location-card').forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-location-id') === id);
    });
    const target = document.querySelector(`.location-card[data-location-id="${id}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Modo detalhado - destacar card e fazer scroll 
  highlightChartCard(id) {
    document.querySelectorAll('.chart-card').forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-location-id') === id);
    });
    const target = document.querySelector(`.chart-card[data-location-id="${id}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Renderizar modo de comparação
  renderComparison(locations) {
    this.renderMarkers('markersComparison', locations, true, false, (id) => {
      this.highlightComparisonCard(id);
    });

    const grid = document.getElementById('comparisonGrid');
    grid.innerHTML = '';

    locations.forEach(location => {
      const status = dataManager.classifyLocation(location.sensors);
      const card = document.createElement('div');
      card.className = 'location-card';
      card.setAttribute('data-location-id', location.id);
      if (this.selectedLocationId === location.id) card.classList.add('active');

      const s = location.sensors;
      const imageHtml = location.image ? `<img src="${location.image}" alt="${location.name}" class="location-card-image">` : '';

      card.innerHTML = `
        ${imageHtml}
        <div class="card-header">
          <div class="card-title">${location.name}</div>
          <div class="status-badge-card ${status}">${status === 'normal' ? 'Normal' : status === 'uncomfortable' ? 'Desconf.' : 'Perigoso'}</div>
        </div>
        <div class="metric-grid">
          <div class="metric-item">
            <div class="metric-label">Temperatura</div>
            <div class="metric-value">${s.temperature.toFixed(1)}<span class="metric-unit">°C</span></div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Humidade</div>
            <div class="metric-value">${s.humidity.toFixed(1)}<span class="metric-unit">%</span></div>
          </div>
          <div class="metric-item">
            <div class="metric-label">CO</div>
            <div class="metric-value">${s.co.toFixed(0)}<span class="metric-unit">ppm</span></div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Som</div>
            <div class="metric-value">${s.sound.toFixed(0)}<span class="metric-unit">dB</span></div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Luz</div>
            <div class="metric-value">${s.light.toFixed(0)}<span class="metric-unit">lx</span></div>
          </div>
          <div class="metric-item">
            <div class="metric-label">ID</div>
            <div class="metric-value" style="font-size: 14px;">${location.id}</div>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  // Renderizar modo detalhado
  renderDetailed(locations) {
    this.renderMarkers('markersDetailed', locations, true, true, (id) => {
      this.highlightChartCard(id);
    });

    const content = document.getElementById('chartsContent');
    if (!content) return;

    content.innerHTML = '';

    locations.forEach(location => {
      const status = dataManager.classifyLocation(location.sensors);
      const statusText = {
        normal: 'Normal',
        uncomfortable: 'Desconfortável',
        dangerous: 'Perigoso'
      };

      const s = location.sensors;
      const readings = dataManager.getReadings(location);

      const sensorDefs = [
        { key: 'temperature', label: 'Temperatura', unit: '°C', value: s.temperature.toFixed(1) },
        { key: 'humidity', label: 'Humidade', unit: '%', value: s.humidity.toFixed(1) },
        { key: 'airQuality', label: 'CO', unit: 'ppm', value: s.co.toFixed(0) },
        { key: 'noise', label: 'Som', unit: 'dB', value: s.sound.toFixed(0) },
        { key: 'light', label: 'Luz', unit: 'lx', value: s.light.toFixed(0) }
      ];

      const chartsHtml = sensorDefs.map(def => {
        const series = readings.map(r => {
          const sv = r.sensors || r;
          return typeof sv[def.key] === 'number' ? sv[def.key] : 0;
        });
        return `
          <div class="sensor-chart">
            <div class="sensor-chart-head">
              <span class="sensor-chart-label">${def.label}</span>
              <span class="sensor-chart-value">${def.value}<span class="sensor-chart-unit">${def.unit}</span></span>
            </div>
            ${this.buildSparkline(series)}
          </div>
        `;
      }).join('');

      const card = document.createElement('div');
      card.className = 'chart-card';
      card.setAttribute('data-location-id', location.id);
      if (this.selectedLocationId === location.id) card.classList.add('active');
      card.innerHTML = `
        <div class="chart-card-header">
          <div>
            <div class="chart-card-title">${location.name}</div>
            <div class="chart-card-code">${location.code}</div>
          </div>
          <div class="status-badge-card ${status}">${statusText[status]}</div>
        </div>
        <div class="sensor-chart-grid">
          ${chartsHtml}
        </div>
      `;
      content.appendChild(card);
    });
  }

  // Construir grafico svg com array de valores
  buildSparkline(values) {
    const W = 100;
    const H = 32;
    const pad = 3;

    if (!values || values.length === 0) {
      return `<div class="sparkline-empty">Sem dados</div>`;
    }

    // Quando só há o 1º valor - duplica para haver grafico
    if (values.length === 1) {
      values = [values[0], values[0]];
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const stepX = (W - pad * 2) / (values.length - 1);
    const points = values.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (H - pad * 2) * (1 - (v - min) / range);
      return [x, y];
    });

    const line = points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${pad},${H - pad} ${line} ${(W - pad).toFixed(1)},${H - pad}`;
    const last = points[points.length - 1];

    return `
      <svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <polyline class="sparkline-area" points="${area}" />
        <polyline class="sparkline-line" points="${line}" />
        <circle class="sparkline-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5" />
      </svg>
    `;
  }

  // Guardar o local selecionado
  selectLocation(id) {
    this.selectedLocationId = id;
  }

  // Atualizar o relógio no header
  updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('clock').textContent = time;
  }

  updateConnectionStatus() {}

  // Ligar os botões de navegação entre modos
  bindModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        this.switchMode(mode);
      });
    });
  }

  // Renderizar o modo atual
  render() {
    const locations = dataManager.getAllLocations();

    if (this.currentMode === 'overview') {
      this.renderOverview(locations);
    } else if (this.currentMode === 'comparison') {
      this.renderComparison(locations);
    } else if (this.currentMode === 'detailed') {
      this.renderDetailed(locations);
    }
  }
}

const uiController = new UIController();
