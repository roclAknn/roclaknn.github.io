

const resizeObserver = new ResizeObserver(entries => {
  // for (let entry of entries) {}
  fitScale();
});

function buildHeader(title, linkEntries) {
  const parent = document.body;

  linkEntries = [
    ...(linkEntries ?? []),
    ["キューブ計算器", "https://roclaknn.github.io/EV-Cube-Calculator/"],
    ["転生の炎計算器", "https://roclaknn.github.io/EV-RebirthFlame/"],
    ["インナーアビリティ確率表", "https://roclaknn.github.io/EV-InnerAbility/"],
    ["ステータス効率計算器", "https://roclaknn.github.io/MapleStory-StatusCalc/"],
    ["ツールチップ切り取りツール", "https://roclaknn.github.io/tooltip_cropper/"],
  ];

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = "/header.css";
  document.head.appendChild(link);

  const getLinksHTML = () => {
    let html = "";
    linkEntries.forEach(entry => {
      html += `
        <a target="_blank" href="${entry[1]}">${entry[0]}</a>
      `;
    });
    return html;
  };
  const header = document.createElement("header");
  header.innerHTML = `
    <div class="header-dropdown-wrapper">
      <div class="icon-btn" id="menu-btn" title="メニュー" onclick="toggleMenu()">
        <svg viewBox="0 0 16 16"><rect x="1" y="2.5" width="14" height="1.8" rx="0.9"/><rect x="1" y="7.1" width="14" height="1.8" rx="0.9"/><rect x="1" y="11.7" width="14" height="1.8" rx="0.9"/></svg>
      </div>
      <div class="dropdown" id="dropdown">${getLinksHTML()}</div>
    </div>
  
    <h1 class="header-title">${title}</h1>
      
    <div class="header-scalingbtn" onclick="changeFitScaleType()">
      <div class="icon-btn" title="画面に合わせる">
        <svg viewBox="0 0 16 16">
          <rect x="0" y="1" width="1" height="14" rx="1"/><rect x="15" y="1" width="1" height="14" rx="1"/>
          <rect x="1" y="8" width="14" height="1" rx="0.5"/><path d="M1 8.5l3-3v6zM15 8.5l-3-3v6z"/>
        </svg>
      </div>
    </div>
    <div class="header-alignbtn" onclick="changeAlign()">
      <div class="icon-btn active" id="align-left" title="左揃え">
        <svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="6" width="9" height="2" rx="1"/><rect x="1" y="10" width="12" height="2" rx="1"/><rect x="1" y="14" width="7" height="2" rx="1"/></svg>
      </div>
      <div class="icon-btn" id="align-center" title="中央揃え">
        <svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="3.5" y="6" width="9" height="2" rx="1"/><rect x="2" y="10" width="12" height="2" rx="1"/><rect x="4.5" y="14" width="7" height="2" rx="1"/></svg>
      </div>
      <div class="icon-btn" id="align-right" title="右揃え">
        <svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="6" y="6" width="9" height="2" rx="1"/><rect x="3" y="10" width="12" height="2" rx="1"/><rect x="8" y="14" width="7" height="2" rx="1"/></svg>
      </div>
    </div>
  `;
  parent.insertBefore(header, parent.firstChild);

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#menu-btn') && !e.target.closest('#dropdown')) {
      document.getElementById('dropdown').classList.remove('open');
      document.getElementById('menu-btn').classList.remove('active');
    }
  });

  // 縦方向を固定しない
  document.addEventListener('scroll', () => {
    header.style.top = `${- window.scrollY}px`;
  });

  // cookieから揃え位置を復元
  let pos = getCookie("align");
  let scale = getCookie("scale");
  changeFitScaleType(scale || "fit"); //cookieへの追加もされる
  changeAlign(pos || "left"); //cookieへの追加もされる
}

function toggleMenu() {
  const d = document.getElementById('dropdown');
  const b = document.getElementById('menu-btn');
  const open = d.classList.toggle('open');
  b.classList.toggle('active', open);
}

function changeFitScaleType(type = "") {
  const types = ["fit", "default"];
  const btn = document.querySelector(".header-scalingbtn");
  if (types.indexOf(type) < 0) {
    let stat = btn.stat || "";
    let p = types.indexOf(stat) + 1;
    type = types[p % types.length];
  }

  btn.stat = type;
  btn.classList[type == "fit" ? "add" : "remove"]("pressed");

  const main = document.getElementsByTagName("main")[0];
  const content = document.querySelector("#maindiv-wrapper");

  switch (type) {
    case "fit":
      resizeObserver.observe(main);
      resizeObserver.observe(content);
      break;
    default:
      resizeObserver.unobserve(main);
      resizeObserver.unobserve(content);
      break;
  }

  fitScale();

  // cookieの書き込み
  setCookie("scale", type);
}

function fitScale() {
  const btn = document.querySelector(".header-scalingbtn");
  const main = document.getElementsByTagName("main")[0];
  const content = document.querySelector("#maindiv-wrapper");

  const type = btn.stat;
  let sc = 1;
  switch (type) {
    case "fit":
      sc = Math.min(1, window.innerWidth / content.scrollWidth);
      resizeObserver.observe(main);
      resizeObserver.observe(content);
      break;
    default:
      resizeObserver.unobserve(main);
      resizeObserver.unobserve(content);
      break;
  }
  content.style.zoom = sc;

  if (type == "fit" && sc < 1) {
    main.classList.add("fit");
  } else {
    main.classList.remove("fit");
  }
}


function changeAlign(pos = "") {
  const aligns = ["left", "center", "right"];
  const parent = document.querySelector(".header-alignbtn");
  let active = parent.querySelector(`.icon-btn.active`);
  if (aligns.indexOf(pos) < 0) {
    pos = active.id.split("-")[1];
    let p = aligns.indexOf(pos) + 1;
    pos = aligns[p % aligns.length];
  }
  active.classList.remove("active");
  const elem = parent.querySelector(`#align-${pos}`);
  elem.classList.add('active');

  // 配置の適用
  const main = document.getElementsByTagName("main")[0];
  const scalingbtn = document.querySelector(".header-scalingbtn");
  aligns.forEach(p => {
    main.classList[p == pos ? "add" : "remove"](p);
  });

  // cookieの書き込み
  setCookie("align", pos);
}

/* cookie */
function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name) {
  return document.cookie.split("; ").reduce((r, v) => {
    const [key, val] = v.split("=");
    return key === name ? decodeURIComponent(val) : r;
  }, null);
}