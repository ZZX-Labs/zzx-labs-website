// mempool-tiles/js/themes.js
// v2 — 32 built-in ZZX/0xdeadbeef palettes; no runtime theme fetch required.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesThemes?.__version>=2)return;

  function palette(id,name,background,low,mid,high,hot,border,rbf="#d65a5a",nonRbf="#4e83d6",ordinal="#7657a8",data="#6e7480"){
    return Object.freeze({
      id,name,
      colors:{
        background,
        grid:"rgba(255,255,255,.09)",
        border,
        selected:"#ffffff",
        pending:low,
        feeFloor:background,
        feeLow:low,
        feeLow2:low,
        feeMidLow:mid,
        feeMid:mid,
        feeMidHigh:high,
        feeHigh:high,
        feeVeryHigh:hot,
        boosted:hot,
        rbf,
        nonRbf,
        ordinal,
        data,
        unknown:mid,
        textOnTile:"rgba(0,0,0,.78)"
      }
    });
  }

  const THEMES=Object.freeze([
    palette("zzx-default","ZZX Default","#020302","#20353d","#79945f","#c0d674","#e6a42b","#e6a42b"),
    palette("deadbeef","0xDEADBEEF","#050505","#24312b","#60775d","#b8d56a","#f2a93b","#b8d56a"),
    palette("terminal-green","Terminal Green","#010401","#12321b","#2d7b3c","#70e56f","#d4ff6a","#70e56f"),
    palette("amber-crt","Amber CRT","#070400","#352308","#8a5c12","#d99a2b","#ffd166","#d99a2b"),
    palette("phosphor","Phosphor","#000402","#0c2f20","#25744b","#67d98c","#b8ffc9","#67d98c"),
    palette("black-ice","Black Ice","#020407","#172633","#315b72","#6ca8c7","#b9e7ff","#6ca8c7"),
    palette("deep-ocean","Deep Ocean","#01050a","#0f2637","#15536e","#2ea0b8","#77dbe8","#2ea0b8"),
    palette("ultraviolet","Ultraviolet","#05030a","#251f38","#5d4a88","#9f7aea","#e6c7ff","#9f7aea"),
    palette("infrared","Infrared","#080202","#381010","#7a2424","#d54a3a","#ffad66","#d54a3a"),
    palette("monochrome","Monochrome","#030303","#202020","#5c5c5c","#bdbdbd","#f5f5f5","#bdbdbd"),
    palette("graphite","Graphite","#050505","#1d2324","#4a5455","#8f9b9d","#d7dedf","#8f9b9d"),
    palette("paperwhite","Paperwhite","#111111","#303030","#666666","#c9c9c9","#ffffff","#c9c9c9"),
    palette("satoshi","Satoshi","#040403","#25251b","#65633e","#bbb56c","#f4e28b","#bbb56c"),
    palette("halving","Halving","#050402","#2d2614","#79652a","#d0af4a","#ffd76a","#d0af4a"),
    palette("miner","Miner","#030303","#27231d","#6c5a38","#bea35e","#f0c978","#bea35e"),
    palette("hashrate","Hashrate","#020504","#183027","#3e6f58","#76b98d","#b8e5b3","#76b98d"),
    palette("cypherpunk","Cypherpunk","#070207","#32132f","#7c2f6b","#d054b0","#ff93d8","#d054b0"),
    palette("matrix","Matrix","#000300","#0b2910","#1e6a2c","#43c25b","#9cff9f","#43c25b"),
    palette("kali","Kali","#020307","#171d32","#344979","#5d7fd0","#b3c8ff","#5d7fd0"),
    palette("tor","Tor","#050306","#281c2c","#62436b","#a06bac","#e0b0e7","#a06bac"),
    palette("i2p","I2P","#050402","#2c2918","#6f6538","#baa55e","#f3dc8b","#baa55e"),
    palette("onion","Onion","#050204","#2f1628","#6f365e","#b65a91","#eea0c5","#b65a91"),
    palette("moss","Moss","#030503","#1c2b1b","#536647","#8ea572","#d0df92","#8ea572"),
    palette("lichen","Lichen","#050604","#2d3428","#6a7959","#acbd8a","#e1ebb0","#acbd8a"),
    palette("desert","Desert","#070503","#332919","#7d6336","#c69a52","#f0ca7b","#c69a52"),
    palette("rust","Rust","#070302","#351812","#7d3b27","#c8653d","#f3a36f","#c8653d"),
    palette("copper","Copper","#060403","#332219","#79503a","#c47b54","#eda77d","#c47b54"),
    palette("steel","Steel","#030506","#1e2b30","#50666d","#8faab1","#d1e2e6","#8faab1"),
    palette("arctic","Arctic","#020608","#17303a","#3c7180","#75bbca","#c7f0f5","#75bbca"),
    palette("solar","Solar","#080500","#3a2504","#8a5d0d","#dda019","#ffe36b","#dda019"),
    palette("lunar","Lunar","#030306","#202335","#515979","#939cc6","#dde2ff","#939cc6"),
    palette("signal","Signal","#040404","#2d2112","#72501f","#c38b31","#ffcf58","#c38b31")
  ]);

  const BY_ID=new Map(THEMES.map(theme=>[theme.id,theme]));
  let current=THEMES[0];

  function get(){return current;}
  function list(){return THEMES.slice();}
  function set(id){
    const next=BY_ID.get(String(id||""));
    if(next)current=next;
    return current;
  }
  async function load(){return current;}

  W.ZZXMempoolTilesThemes=Object.freeze({
    __version:2,
    get,list,set,load
  });
})();
