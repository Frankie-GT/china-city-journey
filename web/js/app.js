/**
 * 中国城市之旅 - 交互式地图与文稿联动主逻辑
 * 纯原生 ES6 模块架构
 */

// 典雅出版物莫兰迪色谱（用于相邻多边形分色上色）
const MORANDI_PALETTE = [
  '#E2D7C3', '#D3DFD6', '#E7DADF', '#DCE8DC', '#EDE5D4',
  '#D9E4EB', '#F5E4DA', '#EBE4D5', '#DFD4CD', '#D0D9D8',
  '#E5DECE', '#CEDBD6', '#DDE3DB', '#EADBDE', '#E4EAD9'
];

// 状态管理
const state = {
  level: 'country', // 'country' | 'province' | 'city' | 'district'
  currentProvince: null,
  currentCity: null,
  currentDistrict: null,
  currentProvPackage: null,
  
  articlesData: null,
  cityMeta: null,
  neighborsCities: null,
  neighborsDistricts: null,
  
  // 地图图层引用
  geoLayers: {
    provinces: null,
    cities: null,
    districts: null,
    cityBorders: null,
    provinceOutline: null,
    districtLabels: null,
    neighborPolygons: null,
    neighbors: null,
    highlight: null
  },
  
  // 缓存分省数据
  provinceCache: {},
  // 当前高亮图层
  activeLayer: null
};

// 工具函数：根据 ID 获取确定性的色彩
function getPolygonColor(id) {
  let hash = 0;
  const str = String(id || '0');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return MORANDI_PALETTE[Math.abs(hash) % MORANDI_PALETTE.length];
}

// 简单的 Markdown 转 HTML 解析器 (针对段落、粗体、诗词引用、图片)
function parseMarkdown(md) {
  if (!md) return '';
  let html = md;

  // 粗体与斜体
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // 引用块 (Blockquote)
  const lines = html.split('\n');
  const processedLines = [];
  let inQuote = false;
  let quoteBuffer = [];

  for (const line of lines) {
    if (line.startsWith('>')) {
      inQuote = true;
      quoteBuffer.push(line.replace(/^>\s*/, ''));
    } else {
      if (inQuote) {
        processedLines.push(`<blockquote>${quoteBuffer.map(q => `<p>${q}</p>`).join('')}</blockquote>`);
        quoteBuffer = [];
        inQuote = false;
      }
      processedLines.push(line);
    }
  }
  if (inQuote) {
    processedLines.push(`<blockquote>${quoteBuffer.map(q => `<p>${q}</p>`).join('')}</blockquote>`);
  }
  html = processedLines.join('\n');

  // 图片
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<div class="art-img-box"><img src="$2" alt="$1"><div class="art-img-caption">$1</div></div>');
  
  // 普通段落
  const paragraphs = html.split(/\n\s*\n/);
  return paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<blockquote') || p.startsWith('<div class="art-img-box"') || p.startsWith('<img')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

// ==========================================================================
// 地图核心管理器 (Map Manager)
// ==========================================================================
class MapManager {
  constructor() {
    this.map = null;
    this.initMap();
  }

  initMap() {
    this.map = L.map('map', {
      center: [36.5, 104.5],
      zoom: 4,
      minZoom: 3,
      maxZoom: 14,
      zoomControl: true,
      attributionControl: false
    });

    // 创建独立标签与邻区图层组
    state.geoLayers.districtLabels = L.layerGroup().addTo(this.map);
    state.geoLayers.neighborPolygons = L.layerGroup().addTo(this.map);

    // 默认全国省份样式
    this.styleProvinceDefault = (feature) => {
      const isInset = feature.properties.is_inset;
      return {
        fillColor: isInset ? '#EAE5D9' : getPolygonColor(feature.properties.id),
        fillOpacity: 0.72,
        color: isInset ? '#8C8275' : '#4A3E36',
        weight: isInset ? 1.5 : 2.2,
        opacity: 0.95
      };
    };

    // 背景周边省份样式 (下钻后作为柔和底图)
    this.styleProvinceBackground = (feature, activeProvId) => {
      if (feature.properties.id === activeProvId) {
        return { fillOpacity: 0, opacity: 0, weight: 0 };
      }
      return {
        fillColor: '#EDE7DC',
        fillOpacity: 0.42,
        color: '#B5A99B',
        weight: 1.2,
        opacity: 0.8
      };
    };

    // 县级底层多边形样式 (带有填充与精细虚线)
    this.styleDistrict = (feature) => {
      return {
        fillColor: getPolygonColor(feature.properties.id),
        fillOpacity: 0.65,
        color: '#A09488',
        weight: 0.8,
        dashArray: '3, 3',
        opacity: 0.85
      };
    };

    // 地级市边界覆盖线样式 (无填充，仅 2.2px 深灰褐色实线)
    this.styleCityBorder = () => {
      return {
        fill: false,
        color: '#4E4238',
        weight: 2.2,
        opacity: 0.95
      };
    };
  }

  // 1. 加载全国省级地图 (去除 [志] 印章，纯净文字)
  loadNationalMap(geoData) {
    if (state.geoLayers.provinces) {
      this.map.removeLayer(state.geoLayers.provinces);
    }
    this.clearDetailLayers();

    state.geoLayers.provinces = L.geoJSON(geoData, {
      style: this.styleProvinceDefault,
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        if (p.is_inset) {
          layer.bindTooltip('<span class="label-prov" style="font-size:11px;">南海诸岛</span>', { 
            permanent: true, 
            direction: 'center', 
            className: 'permanent-map-label' 
          });
          return;
        }

        // 常驻名称标注 (纯净地名，无印章)
        const labelHtml = `<span class="label-prov">${p.name}</span>`;
        layer.bindTooltip(labelHtml, {
          permanent: true,
          direction: 'center',
          className: 'permanent-map-label'
        });

        layer.on({
          mouseover: (e) => {
            if (state.level === 'country') {
              const l = e.target;
              l.setStyle({ fillOpacity: 0.88, weight: 3.2, color: '#B83A2E' });
              l.bringToFront();
            }
          },
          mouseout: (e) => {
            if (state.level === 'country') {
              state.geoLayers.provinces.resetStyle(e.target);
            }
          },
          click: () => {
            app.drillDownToProvince(p.id, p.name, p.ext_name);
          }
        });
      }
    }).addTo(this.map);

    this.map.flyTo([36.5, 104.5], 4, { duration: 0.8 });
  }

  // 2. 加载分省矢量切片（点击省级时不显示县级标注，只显示地级标注；彻底消除 [志] 印章）
  loadProvinceDetails(provPackage, provId) {
    this.clearDetailLayers();
    state.currentProvPackage = provPackage;

    // 隐藏当前省份的粗略多边形，保留周围邻省为柔和背景
    if (state.geoLayers.provinces) {
      state.geoLayers.provinces.eachLayer(l => {
        l.setStyle(this.styleProvinceBackground(l.feature, provId));
      });
    }

    // 第1级：县级底层多边形 (填充莫兰迪分色，0.8px 虚线。注意：此处不绑定常驻县级标注，保持省级界面清爽！)
    state.geoLayers.districts = L.geoJSON(provPackage.districts, {
      style: this.styleDistrict,
      onEachFeature: (feature, layer) => {
        const p = feature.properties;

        // 仅悬浮时显示提示框
        layer.bindTooltip(`${p.ext_name || p.name}`, {
          className: 'map-tooltip',
          sticky: true
        });

        layer.on({
          mouseover: (e) => {
            e.target.setStyle({ fillOpacity: 0.88, weight: 1.8, color: '#C28B38' });
          },
          mouseout: (e) => {
            if (state.activeLayer !== e.target) {
              state.geoLayers.districts.resetStyle(e.target);
            }
          },
          click: (e) => {
            L.DomEvent.stopPropagation(e);
            app.selectDistrict(p.id, p.pid, p.name, p.ext_name, e.target);
          }
        });
      }
    }).addTo(this.map);

    // 第2级：地级市边界线覆盖层 (2.2px 实线覆盖在县级多边形之上，并常驻显示地级市名称，无 [志] 印章)
    state.geoLayers.cityBorders = L.geoJSON(provPackage.cities, {
      style: this.styleCityBorder,
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const cityLabel = `<span class="label-city">${p.ext_name || p.name}</span>`;
        
        // 常驻地级市标注
        layer.bindTooltip(cityLabel, {
          permanent: true,
          direction: 'center',
          className: 'permanent-map-label'
        });

        layer.on({
          mouseover: (e) => {
            e.target.setStyle({ weight: 3.2, color: '#B83A2E' });
          },
          mouseout: (e) => {
            e.target.setStyle(this.styleCityBorder());
          },
          click: (e) => {
            L.DomEvent.stopPropagation(e);
            app.selectCity(p.id, p.name, p.ext_name, e.target);
          }
        });
      }
    }).addTo(this.map);

    // 第3级：省级最外轮廓线条 (最粗 3.8px 深褐色)
    state.geoLayers.provinceOutline = L.geoJSON(provPackage.cities, {
      style: () => ({
        fill: false,
        color: '#2B221B',
        weight: 3.5,
        opacity: 0.95
      }),
      interactive: false
    }).addTo(this.map);

    // 缩放到该省范围
    const bounds = state.geoLayers.districts.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 8, duration: 0.8 });
    }
  }

  // 3. 动态更新区县标注 (仅在点击/选中具体地级市后，才在该市内显示区县常驻标注)
  updateDistrictLabels(cityId) {
    if (!state.geoLayers.districtLabels) return;
    state.geoLayers.districtLabels.clearLayers();

    if (!cityId || !state.currentProvPackage) return;

    // 过滤属于该市的区县
    const distFeatures = state.currentProvPackage.districts.features.filter(f => f.properties.pid === cityId);
    for (const feat of distFeatures) {
      const p = feat.properties;
      const center = p.center;
      if (!center) continue;

      const isCurrentActive = state.currentDistrict && state.currentDistrict.id === p.id;
      const marker = L.marker([center[1], center[0]], {
        icon: L.divIcon({
          className: 'permanent-map-label',
          html: `<span class="label-district ${isCurrentActive ? 'active' : ''}">${p.name}</span>`,
          iconSize: [60, 18],
          iconAnchor: [30, 9]
        }),
        interactive: false
      });
      state.geoLayers.districtLabels.addLayer(marker);
    }
  }

  // 4. 选中地级市时：动态拉取并展示邻省接壤地级市的多边形地图 (画卷式淡彩融合)
  async renderCityNeighborPolygons(cityId) {
    if (!state.geoLayers.neighborPolygons) return;
    state.geoLayers.neighborPolygons.clearLayers();

    if (!state.neighborsCities || !state.neighborsCities[cityId]) return;
    const neighbors = state.neighborsCities[cityId];
    // 找出所有外省接壤的地级市
    const outsideNeighbors = neighbors.filter(n => n.is_outside_province);

    for (const nb of outsideNeighbors) {
      try {
        let provPkg = state.provinceCache[nb.province_id];
        if (!provPkg) {
          provPkg = await fetch(`data/provinces/${nb.province_id}.json`).then(r => r.json());
          state.provinceCache[nb.province_id] = provPkg;
        }

        // 寻找该外省地级市的多边形
        const cityFeat = provPkg.cities.features.find(f => f.properties.id === nb.id);
        if (cityFeat) {
          L.geoJSON(cityFeat, {
            style: {
              fillColor: getPolygonColor(cityFeat.properties.id),
              fillOpacity: 0.38, // 柔和淡彩，画卷式融合
              color: '#5C5045',
              weight: 1.8,
              opacity: 0.85
            },
            onEachFeature: (feat, layer) => {
              const labelHtml = `<div class="label-neighbor-poly" title="点击漫游至 ${nb.label}">
                <span class="neighbor-poly-tag">邻省</span>${nb.label}
              </div>`;
              layer.bindTooltip(labelHtml, {
                permanent: true,
                direction: 'center',
                className: 'permanent-map-label'
              });

              layer.on({
                mouseover: () => layer.setStyle({ fillOpacity: 0.6, weight: 2.4, color: '#B83A2E' }),
                mouseout: () => layer.setStyle({ fillOpacity: 0.38, weight: 1.8, color: '#5C5045' }),
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  app.jumpToCity(nb.province_id, nb.id);
                }
              });
            }
          }).addTo(state.geoLayers.neighborPolygons);
        }
      } catch (err) {
        console.warn(`加载外省地级市多边形失败 (${nb.label}):`, err);
      }
    }
  }

  // 5. 选中县级行政区时：动态拉取并展示外省接壤县级区划的多边形地图 (画卷式淡彩融合)
  async renderDistrictNeighborPolygons(distId) {
    if (!state.geoLayers.neighborPolygons) return;
    state.geoLayers.neighborPolygons.clearLayers();

    if (!state.neighborsDistricts || !state.neighborsDistricts[distId]) return;
    const neighbors = state.neighborsDistricts[distId];
    // 找出所有外省接壤的区县
    const outsideNeighbors = neighbors.filter(n => n.relation === 'other_province');

    for (const nb of outsideNeighbors) {
      try {
        let provPkg = state.provinceCache[nb.province_id];
        if (!provPkg) {
          provPkg = await fetch(`data/provinces/${nb.province_id}.json`).then(r => r.json());
          state.provinceCache[nb.province_id] = provPkg;
        }

        // 寻找该外省区县的多边形
        const distFeat = provPkg.districts.features.find(f => f.properties.id === nb.id);
        if (distFeat) {
          L.geoJSON(distFeat, {
            style: {
              fillColor: getPolygonColor(distFeat.properties.id),
              fillOpacity: 0.42, // 莫兰迪水彩淡彩
              color: '#6E6053',
              weight: 1.4,
              opacity: 0.85
            },
            onEachFeature: (feat, layer) => {
              const labelHtml = `<div class="label-neighbor-poly" title="点击定位 ${nb.label}">
                <span class="neighbor-poly-tag">外省邻县</span>${nb.label}
              </div>`;
              layer.bindTooltip(labelHtml, {
                permanent: true,
                direction: 'center',
                className: 'permanent-map-label'
              });

              layer.on({
                mouseover: () => layer.setStyle({ fillOpacity: 0.65, weight: 2.2, color: '#C28B38' }),
                mouseout: () => layer.setStyle({ fillOpacity: 0.42, weight: 1.4, color: '#6E6053' }),
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  app.jumpToCity(nb.province_id, nb.city_id, nb.id);
                }
              });
            }
          }).addTo(state.geoLayers.neighborPolygons);
        }
      } catch (err) {
        console.warn(`加载外省区县多边形失败 (${nb.label}):`, err);
      }
    }
  }

  // 清除下钻细节图层
  clearDetailLayers() {
    if (state.geoLayers.cities) {
      this.map.removeLayer(state.geoLayers.cities);
      state.geoLayers.cities = null;
    }
    if (state.geoLayers.cityBorders) {
      this.map.removeLayer(state.geoLayers.cityBorders);
      state.geoLayers.cityBorders = null;
    }
    if (state.geoLayers.districts) {
      this.map.removeLayer(state.geoLayers.districts);
      state.geoLayers.districts = null;
    }
    if (state.geoLayers.provinceOutline) {
      this.map.removeLayer(state.geoLayers.provinceOutline);
      state.geoLayers.provinceOutline = null;
    }
    if (state.geoLayers.districtLabels) {
      state.geoLayers.districtLabels.clearLayers();
    }
    if (state.geoLayers.neighborPolygons) {
      state.geoLayers.neighborPolygons.clearLayers();
    }
    if (state.geoLayers.highlight) {
      this.map.removeLayer(state.geoLayers.highlight);
      state.geoLayers.highlight = null;
    }
    state.activeLayer = null;
  }

  // 高亮某个特定图层
  highlightFeature(layer, color = '#B83A2E') {
    if (state.activeLayer && state.geoLayers.districts) {
      state.geoLayers.districts.resetStyle(state.activeLayer);
    }
    state.activeLayer = layer;
    if (layer) {
      layer.setStyle({
        fillOpacity: 0.92,
        color: color,
        weight: 2.8
      });
      layer.bringToFront();
    }
  }
}

// ==========================================================================
// 主应用逻辑控制器 (App Controller)
// ==========================================================================
class App {
  constructor() {
    this.mapMgr = new MapManager();
    this.initDomElements();
    this.bindEvents();
    this.loadData();
  }

  // 判断当前是否处于移动端视图
  isMobileView() {
    return window.innerWidth <= 768;
  }

  initDomElements() {
    // 面包屑
    this.bcNav = document.getElementById('breadcrumbNav');
    this.bcProvince = document.getElementById('bcProvince');
    this.bcCity = document.getElementById('bcCity');
    this.bcDistrict = document.getElementById('bcDistrict');

    // 搜索与工具
    this.searchInput = document.getElementById('searchInput');
    this.searchResults = document.getElementById('searchResults');
    this.btnResetView = document.getElementById('btnResetView');
    this.btnAbout = document.getElementById('btnAbout');
    this.aboutModal = document.getElementById('aboutModal');
    this.btnModalClose = document.getElementById('btnModalClose');

    // 图例与抽屉
    this.drawerPanel = document.getElementById('drawerPanel');
    this.drawerToggle = document.getElementById('drawerToggle');
    this.drawerWelcome = document.getElementById('drawerWelcome');
    this.drawerArticle = document.getElementById('drawerArticle');
    this.drawerPlaceholder = document.getElementById('drawerPlaceholder');
    this.quickChips = document.getElementById('quickChips');
    this.featuredCards = document.getElementById('featuredCards');

    // 统计标签
    this.statRecordedCount = document.getElementById('statRecordedCount');
    this.statCurrentLevel = document.getElementById('statCurrentLevel');

    // 手机端默认收起抽屉
    if (this.isMobileView()) {
      this.drawerPanel.classList.add('collapsed');
    }
  }

  async loadData() {
    try {
      const [provRes, artRes, metaRes, nCityRes, nDistRes] = await Promise.all([
        fetch('data/china_provinces.json').then(r => r.json()),
        fetch('data/articles.json').then(r => r.json()),
        fetch('data/city_meta.json').then(r => r.json()).catch(() => []),
        fetch('data/neighbors_cities.json').then(r => r.json()).catch(() => ({})),
        fetch('data/neighbors_districts.json').then(r => r.json()).catch(() => ({}))
      ]);

      state.articlesData = artRes;
      state.cityMeta = metaRes;
      state.neighborsCities = nCityRes;
      state.neighborsDistricts = nDistRes;

      // 渲染全国省界
      this.mapMgr.loadNationalMap(provRes);

      // 更新状态与快捷城市
      const documentedCount = artRes.documented_city_ids.length;
      this.statRecordedCount.textContent = documentedCount;
      this.renderQuickCities();
      this.renderFeaturedCards();

    } catch (err) {
      console.error('初始化数据加载失败:', err);
    }
  }

  bindEvents() {
    // 抽屉折叠/展开与地图尺寸刷新
    this.drawerToggle.addEventListener('click', () => {
      this.drawerPanel.classList.toggle('collapsed');
      setTimeout(() => {
        this.mapMgr.map.invalidateSize({ pan: false });
      }, 360);
    });

    // 窗口尺寸变化处理
    window.addEventListener('resize', () => {
      this.mapMgr.map.invalidateSize({ pan: false });
    });

    // 面包屑导航点击
    this.bcNav.addEventListener('click', (e) => {
      const target = e.target.closest('.breadcrumb-item');
      if (!target) return;
      const lvl = target.dataset.level;

      if (lvl === 'country') {
        this.resetToCountry();
      } else if (lvl === 'province' && state.currentProvince) {
        this.drillDownToProvince(state.currentProvince.id, state.currentProvince.name, state.currentProvince.ext_name, true);
      } else if (lvl === 'city' && state.currentCity) {
        this.selectCity(state.currentCity.id, state.currentCity.name, state.currentCity.ext_name);
      }
    });

    // 重置按钮
    this.btnResetView.addEventListener('click', () => {
      this.resetToCountry();
    });

    // 关于弹窗
    this.btnAbout.addEventListener('click', () => {
      this.aboutModal.style.display = 'flex';
    });
    this.btnModalClose.addEventListener('click', () => {
      this.aboutModal.style.display = 'none';
    });
    this.aboutModal.addEventListener('click', (e) => {
      if (e.target === this.aboutModal) this.aboutModal.style.display = 'none';
    });

    // 搜索输入与模糊匹配
    let searchDebounce = null;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const query = e.target.value.trim().toLowerCase();
      if (!query) {
        this.searchResults.style.display = 'none';
        return;
      }
      searchDebounce = setTimeout(() => this.performSearch(query), 180);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        this.searchResults.style.display = 'none';
      }
    });
  }

  // 渲染顶部收录城市快捷标签
  renderQuickCities() {
    this.quickChips.innerHTML = '';
    const documentedIds = state.articlesData.documented_city_ids;
    for (const cid of documentedIds) {
      const cityArt = state.articlesData.cities[cid];
      if (!cityArt) continue;
      const chip = document.createElement('span');
      chip.className = 'quick-chip';
      chip.textContent = `${cityArt.province_name} · ${cityArt.city_name}`;
      chip.addEventListener('click', () => {
        this.jumpToCity(cityArt.province_id, cityArt.city_id);
      });
      this.quickChips.appendChild(chip);
    }
  }

  // 渲染欢迎页城市卡片
  renderFeaturedCards() {
    this.featuredCards.innerHTML = '';
    const documentedIds = state.articlesData.documented_city_ids;
    for (const cid of documentedIds) {
      const cityArt = state.articlesData.cities[cid];
      if (!cityArt) continue;
      const card = document.createElement('div');
      card.className = 'featured-card';
      card.innerHTML = `
        <div>
          <span class="fc-name">${cityArt.city_name}</span>
          <span class="fc-prov">${cityArt.province_name}</span>
        </div>
        <span class="fc-tag">${cityArt.sections.length} 个区县风物</span>
      `;
      card.addEventListener('click', () => {
        this.jumpToCity(cityArt.province_id, cityArt.city_id);
      });
      this.featuredCards.appendChild(card);
    }
  }

  // 搜索实现
  performSearch(query) {
    if (!state.cityMeta || !state.cityMeta.length) return;
    const matches = [];
    for (const item of state.cityMeta) {
      if (item.name.includes(query) || 
          (item.ext_name && item.ext_name.includes(query)) ||
          (item.pinyin && item.pinyin.replace(/\s+/g, '').includes(query)) ||
          (item.pinyin_prefix && item.pinyin_prefix.includes(query))) {
        matches.push(item);
        if (matches.length >= 12) break;
      }
    }

    if (!matches.length) {
      this.searchResults.innerHTML = '<div class="search-item" style="color:var(--text-muted);">无匹配行政区划</div>';
      this.searchResults.style.display = 'block';
      return;
    }

    this.searchResults.innerHTML = matches.map(m => {
      const levelLabel = m.deep === 0 ? '省' : m.deep === 1 ? '市' : '区县';
      const badgeClass = m.has_article ? 'search-item-badge recorded' : 'search-item-badge';
      const badgeText = m.has_article ? '已收录' : levelLabel;
      return `
        <div class="search-item" data-id="${m.id}" data-deep="${m.deep}" data-pid="${m.pid}">
          <span class="search-item-title">${m.ext_name || m.name}</span>
          <span class="${badgeClass}">${badgeText}</span>
        </div>
      `;
    }).join('');

    this.searchResults.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const deep = parseInt(el.dataset.deep);
        const pid = el.dataset.pid;
        this.handleSearchResultClick(id, deep, pid);
        this.searchResults.style.display = 'none';
        this.searchInput.value = '';
      });
    });

    this.searchResults.style.display = 'block';
  }

  handleSearchResultClick(id, deep, pid) {
    if (deep === 0) {
      const meta = state.cityMeta.find(m => m.id === id);
      this.drillDownToProvince(id, meta.name, meta.ext_name);
    } else if (deep === 1) {
      this.jumpToCity(pid, id);
    } else if (deep === 2) {
      const cityMeta = state.cityMeta.find(m => m.id === pid);
      const provId = cityMeta ? cityMeta.pid : id.slice(0, 2);
      this.jumpToCity(provId, pid, id);
    }
  }

  // 快捷直接跳转城市
  async jumpToCity(provId, cityId, distId = null) {
    const provMeta = state.cityMeta.find(m => m.id === provId);
    await this.drillDownToProvince(provId, provMeta ? provMeta.name : '', provMeta ? provMeta.ext_name : '', false);
    
    let targetCityLayer = null;
    if (state.geoLayers.districts) {
      state.geoLayers.districts.eachLayer(l => {
        if (l.feature.properties.pid === cityId) {
          targetCityLayer = l;
        }
      });
    }
    const cityMeta = state.cityMeta.find(m => m.id === cityId);
    this.selectCity(cityId, cityMeta ? cityMeta.name : '', cityMeta ? cityMeta.ext_name : '', targetCityLayer);

    if (distId) {
      setTimeout(() => {
        let targetDistLayer = null;
        if (state.geoLayers.districts) {
          state.geoLayers.districts.eachLayer(l => {
            if (l.feature.properties.id === distId) {
              targetDistLayer = l;
            }
          });
        }
        const distMeta = state.cityMeta.find(m => m.id === distId);
        this.selectDistrict(distId, cityId, distMeta ? distMeta.name : '', distMeta ? distMeta.ext_name : '', targetDistLayer);
      }, 350);
    }
  }

  // 下钻到省份 (手机端默认保持抽屉收起，不自动展开)
  async drillDownToProvince(provId, name, extName, clearCity = true) {
    state.level = 'province';
    state.currentProvince = { id: provId, name, ext_name: extName };
    if (clearCity) {
      state.currentCity = null;
      state.currentDistrict = null;
      // 在省级视图下，清除县级标注，只保留地级市标注
      this.mapMgr.updateDistrictLabels(null);
      if (state.geoLayers.neighborPolygons) {
        state.geoLayers.neighborPolygons.clearLayers();
      }
    }

    this.updateBreadcrumb();
    this.statCurrentLevel.textContent = `${name || extName} (市县级)`;

    // 拉取分省切片数据
    let provPackage = state.provinceCache[provId];
    if (!provPackage) {
      try {
        provPackage = await fetch(`data/provinces/${provId}.json`).then(r => r.json());
        state.provinceCache[provId] = provPackage;
      } catch (err) {
        console.error(`加载省份 ${provId} 失败:`, err);
        return;
      }
    }

    // 绘制该省的分级市县
    this.mapMgr.loadProvinceDetails(provPackage, provId);

    // 手机端：保持抽屉收起状态，绝不自动展开
    if (this.isMobileView()) {
      this.drawerPanel.classList.add('collapsed');
    } else {
      this.drawerPanel.classList.remove('collapsed');
      setTimeout(() => {
        this.mapMgr.map.invalidateSize({ pan: false });
      }, 360);
      if (clearCity) {
        this.renderProvinceWelcome(provId, name, extName, provPackage);
      }
    }
  }

  // 选中地级市 (手机端保持收起；加载该市下辖县标注；加载邻省接壤地级市地图)
  selectCity(cityId, name, extName, layer = null) {
    state.level = 'city';
    state.currentCity = { id: cityId, name, ext_name: extName };
    state.currentDistrict = null;
    this.updateBreadcrumb();
    this.statCurrentLevel.textContent = `${extName || name}`;

    if (layer) {
      this.mapMgr.highlightFeature(layer, '#B83A2E');
      this.mapMgr.map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 10, duration: 0.6 });
    }

    // 1. 动态在该地级市内展示其下辖区县的常驻标注
    this.mapMgr.updateDistrictLabels(cityId);

    // 2. 动态加载并展示邻省接壤地级市的实际行政区划多边形地图 (画卷式淡彩融合)
    this.mapMgr.renderCityNeighborPolygons(cityId);

    // 3. 抽屉展开逻辑：手机端保持收起；桌面端正常展示
    if (this.isMobileView()) {
      this.drawerPanel.classList.add('collapsed');
    } else {
      this.drawerPanel.classList.remove('collapsed');
      setTimeout(() => {
        this.mapMgr.map.invalidateSize({ pan: false });
      }, 360);
    }

    // 填充文稿内容
    const article = state.articlesData.cities[cityId];
    if (article) {
      this.renderArticle(article);
    } else {
      this.renderPlaceholder(cityId, name, extName);
    }
  }

  // 选中区县 (核心逻辑：手机端只有点击“有相关文档”的县级才自动展开，其他情况绝不展开！)
  selectDistrict(distId, cityId, name, extName, layer = null) {
    state.level = 'district';
    state.currentDistrict = { id: distId, name, ext_name: extName };
    this.updateBreadcrumb();

    if (layer) {
      this.mapMgr.highlightFeature(layer, '#C28B38');
      this.mapMgr.map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 11, duration: 0.5 });
    }

    // 1. 确保该地级市的区县常驻标注处于激活状态
    this.mapMgr.updateDistrictLabels(cityId);

    // 2. 动态加载并展示外省接壤县级区划的实际行政多边形地图 (画卷式淡彩融合)
    this.mapMgr.renderDistrictNeighborPolygons(distId);

    // 3. 检查当前县级行政区是否有收录文稿
    const distInfo = state.articlesData.district_to_article[distId];
    const hasArticle = Boolean(distInfo);

    // 4. 严格响应手机端需求：只有点击有相关文档的县级才自动展开抽屉！
    if (this.isMobileView()) {
      if (hasArticle) {
        this.drawerPanel.classList.remove('collapsed');
        setTimeout(() => {
          this.mapMgr.map.invalidateSize({ pan: false });
        }, 360);
      } else {
        this.drawerPanel.classList.add('collapsed');
      }
    } else {
      this.drawerPanel.classList.remove('collapsed');
      setTimeout(() => {
        this.mapMgr.map.invalidateSize({ pan: false });
      }, 360);
    }

    if (distInfo) {
      const cityArt = state.articlesData.cities[distInfo.city_id];
      if (cityArt) {
        this.renderArticle(cityArt, distInfo.section_index);
        return;
      }
    }

    // 若当前城市已有文章，尝试平滑滚动到对应章节
    if (state.currentCity && state.articlesData.cities[state.currentCity.id]) {
      const cityArt = state.articlesData.cities[state.currentCity.id];
      const matchIdx = cityArt.sections.findIndex(s => s.heading.includes(name) || (extName && s.heading.includes(extName)));
      if (matchIdx !== -1) {
        this.scrollToSection(matchIdx);
      }
    }
  }

  // 重置回全国视图
  resetToCountry() {
    state.level = 'country';
    state.currentProvince = null;
    state.currentCity = null;
    state.currentDistrict = null;
    this.updateBreadcrumb();
    this.statCurrentLevel.textContent = '全国 (省级)';

    fetch('data/china_provinces.json')
      .then(r => r.json())
      .then(geo => this.mapMgr.loadNationalMap(geo));

    if (this.isMobileView()) {
      this.drawerPanel.classList.add('collapsed');
    } else {
      this.drawerWelcome.style.display = 'block';
      this.drawerArticle.style.display = 'none';
      this.drawerPlaceholder.style.display = 'none';
      setTimeout(() => {
        this.mapMgr.map.invalidateSize({ pan: false });
      }, 360);
    }
  }

  // 更新顶部面包屑
  updateBreadcrumb() {
    const seps = this.bcNav.querySelectorAll('.breadcrumb-separator');
    seps.forEach(s => s.style.display = 'none');

    const countryBtn = this.bcNav.querySelector('[data-level="country"]');
    countryBtn.className = `breadcrumb-item ${state.level === 'country' ? 'active' : ''}`;

    if (state.currentProvince) {
      this.bcProvince.textContent = state.currentProvince.name || state.currentProvince.ext_name;
      this.bcProvince.style.display = 'inline-block';
      this.bcProvince.className = `breadcrumb-item ${state.level === 'province' ? 'active' : ''}`;
      seps[0].style.display = 'inline-block';
    } else {
      this.bcProvince.style.display = 'none';
    }

    if (state.currentCity) {
      this.bcCity.textContent = state.currentCity.name || state.currentCity.ext_name;
      this.bcCity.style.display = 'inline-block';
      this.bcCity.className = `breadcrumb-item ${state.level === 'city' ? 'active' : ''}`;
      seps[1].style.display = 'inline-block';
    } else {
      this.bcCity.style.display = 'none';
    }

    if (state.currentDistrict) {
      this.bcDistrict.textContent = state.currentDistrict.name || state.currentDistrict.ext_name;
      this.bcDistrict.style.display = 'inline-block';
      this.bcDistrict.className = `breadcrumb-item ${state.level === 'district' ? 'active' : ''}`;
      seps[2].style.display = 'inline-block';
    } else {
      this.bcDistrict.style.display = 'none';
    }
  }

  // 渲染省份总览引导
  renderProvinceWelcome(provId, name, extName, provPackage) {
    this.drawerWelcome.style.display = 'block';
    this.drawerArticle.style.display = 'none';
    this.drawerPlaceholder.style.display = 'none';

    const cityCount = provPackage.cities.features.length;
    const distCount = provPackage.districts.features.length;

    this.drawerWelcome.querySelector('h2').textContent = extName || name;
    this.drawerWelcome.querySelector('.welcome-desc').innerHTML = `
      该省份辖有 <b>${cityCount}</b> 个地级行政单位、<b>${distCount}</b> 个区县。<br>
      请点击地图上的具体城市进入深度阅读。
    `;
  }

  // 渲染城市文稿长文
  renderArticle(article, highlightSectionIdx = null) {
    this.drawerWelcome.style.display = 'none';
    this.drawerPlaceholder.style.display = 'none';
    this.drawerArticle.style.display = 'block';

    document.getElementById('artProvince').textContent = article.province_name;
    document.getElementById('artTitle').textContent = article.title;
    document.getElementById('artAdcode').textContent = `区划编码: ${article.city_ext_id || article.city_id}`;
    document.getElementById('artIntro').innerHTML = parseMarkdown(article.intro);

    // 渲染锚点胶囊
    const anchorsEl = document.getElementById('artAnchors');
    anchorsEl.innerHTML = article.sections.map((sec, idx) => {
      const shortHead = sec.heading.split(/[:：]/)[0];
      return `<button class="anchor-chip" data-idx="${idx}">${shortHead}</button>`;
    }).join('');

    anchorsEl.querySelectorAll('.anchor-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        this.scrollToSection(idx);
      });
    });

    // 渲染区县章节卡片
    const sectionsEl = document.getElementById('artSections');
    sectionsEl.innerHTML = article.sections.map((sec, idx) => {
      const tagsHtml = (sec.tags || []).map(t => `<span class="section-tag">${t}</span>`).join('');
      return `
        <div class="section-card" id="sec-${idx}">
          <h3 class="section-title">${sec.heading}</h3>
          ${tagsHtml ? `<div class="section-tags">${tagsHtml}</div>` : ''}
          <div class="section-content">${parseMarkdown(sec.content)}</div>
        </div>
      `;
    }).join('');

    if (highlightSectionIdx !== null) {
      this.scrollToSection(highlightSectionIdx);
    } else {
      document.getElementById('drawerContent').scrollTop = 0;
    }
  }

  // 滚动并高亮对应章节
  scrollToSection(idx) {
    const secEl = document.getElementById(`sec-${idx}`);
    if (!secEl) return;

    document.querySelectorAll('.section-card').forEach(c => c.classList.remove('highlighted'));
    document.querySelectorAll('.anchor-chip').forEach(c => c.classList.remove('active'));

    secEl.classList.add('highlighted');
    const chip = document.querySelector(`.anchor-chip[data-idx="${idx}"]`);
    if (chip) chip.classList.add('active');

    secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 渲染未收录城市占位卡
  renderPlaceholder(cityId, name, extName) {
    this.drawerWelcome.style.display = 'none';
    this.drawerArticle.style.display = 'none';
    this.drawerPlaceholder.style.display = 'block';

    document.getElementById('phName').textContent = extName || name;
    document.getElementById('phProvince').textContent = state.currentProvince ? state.currentProvince.ext_name : '中国';
    document.getElementById('phCode').textContent = `区划代码: ${cityId}`;

    const subList = document.getElementById('phSubList');
    subList.innerHTML = '';
    const dists = (state.cityMeta || []).filter(m => m.pid === cityId && m.deep === 2);
    if (dists.length) {
      dists.forEach(d => {
        const chip = document.createElement('span');
        chip.className = 'ph-sub-chip';
        chip.textContent = d.ext_name || d.name;
        chip.addEventListener('click', () => {
          this.selectDistrict(d.id, cityId, d.name, d.ext_name);
        });
        subList.appendChild(chip);
      });
    } else {
      subList.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">正在加载下辖区县...</span>';
    }
  }
}

// 启动应用
const app = new App();
window.app = app;
