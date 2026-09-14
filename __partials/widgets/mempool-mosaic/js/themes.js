// ZZX-Labs / 0xDEADBEEF transaction-mosaic theme system.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolMosaicThemes?.__version>=3)return;

  const DEFINITIONS=[
    ["zzx-default","ZZX Lab Default","ZZX","#020302","#070a07","#c0d674","#e6a42b","#14272d","#617d55","#c0d674","#e6a42b"],
    ["deadbeef","0xDEADBEEF","ZZX","#030303","#0a0b09","#c0d674","#deadbe","#182927","#657c54","#c0d674","#deadbe"],
    ["terminal-green","Terminal Green","Terminal","#010502","#041007","#7dff8a","#d5ff73","#06351d","#1e9c55","#7dff8a","#d5ff73"],
    ["terminal-amber","Terminal Amber","Terminal","#060401","#110b03","#ffc35c","#ffe1a3","#3c2105","#a8600a","#ffc35c","#fff0bd"],
    ["crt-monochrome","CRT Monochrome","Terminal","#020403","#070b09","#b8cfbf","#f0fff4","#17241c","#587064","#b8cfbf","#f0fff4"],
    ["obsidian-lime","Obsidian Lime","ZZX","#020202","#080a06","#b7ff38","#f1ff9d","#192a0c","#628c21","#b7ff38","#f1ff9d"],
    ["midnight-copper","Midnight Copper","Industrial","#050302","#0f0a07","#e1a56f","#ffcf8a","#2d1810","#8c4d2f","#e1a56f","#ffcf8a"],
    ["scranton-steel","Scranton Steel","Industrial","#030506","#091014","#a8bec9","#d29b52","#13242b","#4a6c7a","#a8bec9","#d29b52"],
    ["deep-ocean","Deep Ocean","Signal","#010507","#041016","#67d5d1","#b7f06a","#072d3b","#137b88","#67d5d1","#b7f06a"],
    ["arctic-relay","Arctic Relay","Signal","#030609","#08131b","#8ad8ff","#e6fbff","#0d3149","#297ca9","#8ad8ff","#e6fbff"],
    ["neon-cyan","Neon Cyan","Signal","#010405","#031013","#45f0ff","#b7fff8","#06313a","#0c8994","#45f0ff","#b7fff8"],
    ["blue-wire","Blue Wire","Signal","#02040a","#071020","#6e9cff","#9ee7ff","#101f4b","#2f57aa","#6e9cff","#9ee7ff"],
    ["violet-cipher","Violet Cipher","Cipher","#040207","#0d0713","#b68cff","#e8c5ff","#241138","#684098","#b68cff","#e8c5ff"],
    ["magenta-trace","Magenta Trace","Cipher","#070206","#130811","#ff79c6","#ffd1ea","#3b0d2a","#a22e73","#ff79c6","#ffd1ea"],
    ["tor-purple","Tor Purple","Cipher","#050307","#100b15","#a98be8","#e9bd67","#26153b","#644692","#a98be8","#e9bd67"],
    ["i2p-indigo","I2P Indigo","Cipher","#030309","#09091a","#8a8cff","#65e0c3","#171744","#4749a3","#8a8cff","#65e0c3"],
    ["crimson-packet","Crimson Packet","Ops","#070202","#130606","#ff7b72","#ffd166","#351011","#9b292d","#ff7b72","#ffd166"],
    ["infrared-ops","Infrared Ops","Ops","#060101","#120404","#ff5f4d","#ffb86b","#310705","#a31c13","#ff5f4d","#ffb86b"],
    ["ghost-grid","Ghost Grid","Ops","#030404","#0b0d0d","#c7d0cf","#81a6a3","#1c2424","#536866","#c7d0cf","#f2f7f6"],
    ["ultraviolet-lab","Ultraviolet Lab","Ops","#050109","#0e0518","#d879ff","#72fff1","#270c3f","#7932a0","#d879ff","#72fff1"],
    ["ukraine-signal","Ukraine Signal","Regional","#02050a","#07101d","#60a5fa","#facc15","#0d2c50","#2368ac","#60a5fa","#facc15"],
    ["saffron-circuit","Saffron Circuit","Regional","#070401","#130b03","#ffb84d","#fff07a","#3c2208","#ad6817","#ffb84d","#fff07a"],
    ["himalayan-night","Himalayan Night","Regional","#030408","#090d16","#8fc7ff","#ffb36b","#112945","#365f87","#8fc7ff","#ffb36b"],
    ["tibetan-dusk","Tibetan Dusk","Regional","#060304","#12090a","#d9a36f","#7ed6b2","#32181e","#8b4850","#d9a36f","#7ed6b2"],
    ["bombay-monsoon","Bombay Monsoon","Regional","#020607","#061216","#58c6b8","#ffb45b","#0c3436","#237f79","#58c6b8","#ffb45b"],
    ["pune-terminal","Pune Terminal","Regional","#030502","#081006","#9bd66f","#f3aa52","#173119","#4d832f","#9bd66f","#f3aa52"],
    ["palo-alto-neon","Palo Alto Neon","Regional","#020407","#07101a","#65d5ff","#d6ff63","#0b3048","#227fa7","#65d5ff","#d6ff63"],
    ["solar-flare","Solar Flare","Celestial","#070301","#140704","#ff884d","#ffe066","#411307","#b44416","#ff884d","#ffe066"],
    ["lunar-obscura","Lunar Obscura","Celestial","#030407","#090c13","#aab7d4","#d9d0ff","#171e35","#4a587d","#aab7d4","#d9d0ff"],
    ["aurora-hash","Aurora Hash","Celestial","#010607","#051214","#6ee7b7","#c084fc","#083531","#218b72","#6ee7b7","#c084fc"],
    ["bitcoin-ember","Bitcoin Ember","Bitcoin","#060301","#120902","#f7931a","#ffd166","#351705","#a84f08","#f7931a","#ffd166"],
    ["blockspace-gold","Blockspace Gold","Bitcoin","#060501","#121003","#d6b85f","#fff1a8","#312b0b","#837126","#d6b85f","#fff1a8"],
    ["hashrate-ice","Hashrate Ice","Bitcoin","#020609","#06131a","#89dceb","#c8f7ff","#0d3141","#327a8b","#89dceb","#c8f7ff"],
    ["mempool-heat","Mempool Heat","Bitcoin","#070202","#140705","#ff6b35","#ffe66d","#39100a","#a53218","#ff6b35","#ffe66d"],
    ["paperwhite-dark","Paperwhite Dark","Accessible","#090908","#11110f","#e4e1d7","#d7ba7d","#292925","#77746b","#e4e1d7","#fffaf0"],
    ["high-contrast","High Contrast","Accessible","#000000","#080808","#ffffff","#ffd400","#1d1d1d","#707070","#ffffff","#ffd400"],
    ["deuteranopia-safe","Deuteranopia Safe","Accessible","#030507","#081016","#56b4e9","#f0e442","#102a3a","#2f78a0","#56b4e9","#f0e442"],
    ["protanopia-safe","Protanopia Safe","Accessible","#030507","#081116","#5ab4ac","#f6c85f","#102d32","#337d78","#5ab4ac","#f6c85f"],
    ["tritanopia-safe","Tritanopia Safe","Accessible","#050305","#100a10","#e78ac3","#8da0cb","#321529","#8b4d78","#e78ac3","#8da0cb"],
    ["sepia-archive","Sepia Archive","Accessible","#080603","#151007","#d8c39a","#efb366","#342714","#80643a","#d8c39a","#efb366"]
  ];

  function rgb(hex){
    const value=String(hex||"").replace("#","");
    return /^[0-9a-f]{6}$/i.test(value)
      ? [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)]
      : [96,96,96];
  }

  function hex(color){
    return `#${color.map(value=>Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,"0")).join("")}`;
  }

  function mix(a,b,t){
    const A=rgb(a),B=rgb(b);
    return hex(A.map((value,index)=>value+(B[index]-value)*t));
  }

  function expand(row){
    const [id,name,group,background,panel,primary,accent,low,mid,high,hot]=row;
    return {
      id,name,group,
      colors:{
        background,panel,primary,accent,
        text:mix(primary,"#ffffff",.56),
        muted:mix(primary,"#777777",.58),
        border:mix(primary,accent,.52),
        selected:"#ffffff",
        hover:accent,
        pending:mix(background,primary,.22),
        feeScale:[low,mix(low,mid,.45),mid,mix(mid,high,.38),mix(mid,high,.68),high,mix(high,hot,.34),mix(high,hot,.68),hot],
        sizeLow:low,
        sizeHigh:primary,
        absoluteFeeLow:mid,
        absoluteFeeHigh:hot,
        rbf:"#ef6a68",
        nonRbf:"#5b8def",
        ordinal:"#a77be8",
        data:"#8b939f",
        boosted:accent,
        unknown:mix(low,primary,.45)
      }
    };
  }

  let catalog=DEFINITIONS.map(expand);

  function validate(theme){
    return theme&&typeof theme==="object"&&theme.id&&theme.name&&theme.colors;
  }

  async function load(url){
    if(!url)return list();
    try{
      const data=await fetch(url,{cache:"no-store"}).then(response=>{
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      const additions=Array.isArray(data)?data:Array.isArray(data?.themes)?data.themes:[];
      const map=new Map(catalog.map(theme=>[theme.id,theme]));
      for(const theme of additions){
        if(validate(theme))map.set(theme.id,theme);
      }
      catalog=[...map.values()];
    }catch(_){}
    return list();
  }

  function list(){
    return catalog.map(theme=>({id:theme.id,name:theme.name,group:theme.group}));
  }

  function get(id="zzx-default"){
    return catalog.find(theme=>theme.id===id)||catalog[0];
  }

  function apply(root,id){
    const theme=get(id);
    const colors=theme.colors;
    if(root){
      root.dataset.mmTheme=theme.id;
      root.style.setProperty("--mm-bg",colors.background);
      root.style.setProperty("--mm-panel",colors.panel);
      root.style.setProperty("--mm-primary",colors.primary);
      root.style.setProperty("--mm-accent",colors.accent);
      root.style.setProperty("--mm-text",colors.text);
      root.style.setProperty("--mm-muted",colors.muted);
      root.style.setProperty("--mm-border",colors.border);
    }
    return theme;
  }

  W.ZZXMempoolMosaicThemes=Object.freeze({
    __version:3,
    load,
    list,
    get,
    apply
  });
})();
