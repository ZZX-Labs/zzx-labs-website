/* Layer identity (source imagery) is independent of the library control theme. */
(function () {
  "use strict";
  const themes = [
    ["Carbon / citron","#0b1011","#172022","#c0d674","#bd8b39"],
    ["Obsidian / amber","#0b0c0e","#19191b","#d1c388","#dfaa54"],
    ["Slate / sage","#111819","#1b2929","#b4cead","#d5a965"],
    ["Midnight / brass","#0c1320","#16243a","#c7d4ad","#c99e56"],
    ["Boreal","#071919","#103031","#8fd5b4","#c9b279"],
    ["Cinder","#16100f","#322321","#dbbaa2","#cc854c"],
    ["Graphite","#121416","#24282b","#b6c5bf","#d9aa6c"],
    ["Moss","#10170e","#26321d","#bad399","#d6a759"],
    ["Ironwood","#18130e","#34291e","#c6cb96","#c3905a"],
    ["Deep ocean","#07131d","#0e2a3c","#91c9d9","#d2b171"],
    ["Petrol","#0a191d","#15353b","#9ed7cb","#c7a774"],
    ["Aubergine","#18121b","#2c2035","#d4b9d7","#e0ac75"],
    ["Oxide","#1b1110","#3b2420","#d3bd9f","#d68c6c"],
    ["Evergreen","#071710","#183325","#a9d3a6","#ddad67"],
    ["Cobalt dusk","#0c1425","#202c4c","#acc8d7","#deba7c"],
    ["Umber","#1a1410","#352820","#d2c2a2","#cba36c"],
    ["Glacier","#0c1c22","#173741","#b6dce0","#d9bc8f"],
    ["Basalt","#111315","#292c30","#b8c4ba","#cba569"],
    ["Sandstone","#1d1710","#3d3223","#e0ceaa","#bd9666"],
    ["Orchid night","#191423","#332942","#d8bedf","#c6a86e"],
    ["Silt","#151a17","#2b3830","#c1c9af","#cfa36a"],
    ["Marine","#071622","#163447","#91bcd7","#d4a86b"],
    ["Forest floor","#14180e","#303822","#c2d89c","#c69b59"],
    ["Ember","#21110f","#452721","#e7b59a","#f0b46b"],
    ["Copper patina","#101b1a","#24403d","#9dd2c0","#d2a575"],
    ["Amethyst","#171427","#2c2947","#c3b7e5","#e0b375"],
    ["Dune","#191910","#343624","#d0d6ab","#d1a579"],
    ["Fjord","#0a171b","#1a353a","#a0d4d4","#cfaf81"],
    ["Lava stone","#1b1115","#392229","#d8b5ae","#d9a26e"],
    ["Nightfall","#0e111c","#22283a","#b5c7e1","#ddb379"],
    ["Lichen","#111a14","#263a2b","#b6d6ad","#b8a672"],
    ["Tungsten","#181716","#30302d","#d1cdbd","#d3a256"]
  ].map(([name,background,panel,accent,gold],index)=>({id:`theme-${index+1}`,name,background,panel,accent,gold}));
  function rgb(hex){return [1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255);}
  window.WFBGlobeConfig=Object.freeze({themes,rgb});
})();
