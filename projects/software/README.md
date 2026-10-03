<div align="center">
<img src="./logo.png" alt="ZZX-Labs Software Projects catalog" width="240" height="240">

# Software Projects

The canonical software catalog for ZZX-Labs R&D.

**Catalog version:** 0.2.0-dev  
**Manifest schema:** 4.0.0-reconciled-software  
**Catalog entries:** 388  
**Top-level project routes:** 327  
**Nested family/module routes:** 61  
**Unique slugs:** 388  
**Unique canonical routes:** 388  
**Collection README license:** MIT  
**Project licenses:** Per-project; see each project manifest  
**Author:** 0xdeadbeef of ZZX-Labs R&D  
**Languages / runtimes:** Python 3.x, JavaScript, HTML/CSS, Kotlin/Android, C/C++, Bash, and project-specific runtimes

</div>

## What it does

`projects/software/` is the software-project index and deployment root for ZZX-Labs R&D. It provides one canonical place to:

- enumerate every software project and nested software module;
- resolve each canonical slug, title, route, version, status, platform set, and summary;
- navigate directly to each project root;
- keep the human-readable README aligned with `manifest.json`;
- distinguish top-level routes from nested family/module routes;
- preserve one uniform project-page contract: `index.html`, `manifest.json`, shared shell files, project-specific assets, documentation, and optional native/runtime source;
- support the software index page used by the ZZX-Labs website.

The catalog below contains **all 388 currently reconciled software entries**. The attached older README described a 298-entry baseline; this rebuilt document is generated from the reconciled manifest instead of preserving that stale count.

## Install

This directory is part of the `zzx-labs-website` repository. No package manager is required to browse the static catalog.

```bash
git clone https://github.com/ZZX-Labs/zzx-labs-website.git
cd zzx-labs-website/projects/software
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

Individual projects may require Python, PyQt5, FFmpeg, Bitcoin tooling, Android tooling, native libraries, model runtimes, or other dependencies. Always use the child project's own `README.md` and `manifest.json` as the runtime-specific instructions.

## Run (GUI)

The software root itself is a browser catalog. Open `index.html` through the site or a local HTTP server.

Individual GUI applications are launched from their own project directories. GUI-capable projects use their project-specific interface and runtime as documented by the child README.

## Run (CLI)

The software root has no single monolithic CLI. CLI-capable projects expose their own entry points inside their respective directories.

The manifest is the machine-readable catalog:

```bash
python -m json.tool manifest.json
```

Project-specific launch syntax belongs in the child project README rather than being guessed at the catalog root.

## Catalog invariants

```text
total software entries = top-level routes + nested routes
                       = 327 + 61
                       = 388

unique slugs           = 388
unique canonical routes= 388
route prefix           = /projects/software/
```

These counts are derived directly from canonical `href` values in the reconciled manifest. Route nesting is therefore determined by the route itself, not by a manually maintained folder list.

### Platform coverage

```text
Linux            355
Windows          352
macOS            344
Android           51
Web               42
Kali              22
Web companion     11
iOS                9
Embedded           5
Any                5
Raspberry Pi       4
Firefox            2
Termux             2
ESP32              1
MicroPython        1
WebAssembly        1
```

### Release-status coverage

```text
alpha            316
development       30
stable            29
beta               7
superseded         3
prototype          2
planned            1
```

### Metadata state

```text
manifest-native  315
reconciled        67
scope-pending      6
```

## Reconciliation state

The current manifest reports:

- attached baseline: **298** records;
- prior software vNext: **315** records;
- reconciled software registry: **388** records;
- current-roster additions after the prior vNext: **73** records;
- canonical Freedom family rename: `freedomex -> freedomx`;
- master-portfolio identities intentionally kept outside software routes: `linemanmoon`, `skybee`, `skywasp`, `wally`.

`manifest.json` remains authoritative for the software catalog. Logical parent/suite relationships may exist even when a child has its own top-level route; this README does not invent a nested filesystem path where the canonical `href` does not have one.

## Directory layout

The route tree below is generated from the reconciled canonical routes:

```text
software/
├─ README.md
├─ LICENSE
├─ index.html
├─ manifest.json
├─ style.css
├─ script.js
├─ hook.js
├─ hook.css
├─ logo.png
├─ 4-4/
├─ 4-4-apk/
├─ 4dv/
├─ adrenochrome/
├─ aegissim/
├─ ahab/
├─ aipdabe/
├─ air2w3w/
├─ alexberossusgpt/
├─ ambergris/
├─ androidpp/
├─ archivetagger/
├─ astral-clock/
├─ audio-tagger/
├─ audiolab/
├─ audiosieve/
├─ backabit/
├─ backinabit/
├─ backnabit/
├─ balaklavabuilder3d/
├─ base48-bdef/
├─ bealeforce/
├─ beefs-diceware-wordlists/
├─ beefs-rngs/
├─ beetlee/
├─ berossus/
├─ berossusvoiceai/
├─ bhopal-calc/
├─ bit-clock/
├─ bit-monitor/
├─ bit-tick/
├─ bit-tracker/
├─ bitage/
├─ bitarmor/
├─ bitavg/
├─ bitbetting/
├─ bitbilling/
├─ bitbroker/
├─ bitburn/
├─ bitcasino/
├─ bitcoin-mined/
├─ bitcoin-tully/
├─ bitcoinees/
├─ bitcontract/
├─ bitcontractor/
├─ bitdroid/
├─ bitescrow/
├─ bitfig/
├─ bitgaming/
├─ bitjack/
├─ bitlegal/
├─ bitlotto/
├─ bitonion/
├─ bitpav/
├─ bitpet/
├─ bitrng/
├─ bittrackit/
├─ bittrader/
├─ blackbat/
├─ blackbook/
├─ blackpearl/
├─ blekrat/
├─ blinkeeqr/
├─ blk2txt/
├─ blockclock/
├─ blockclock-apk/
├─ bofs/
├─ borq/
├─ bvtp/
├─ calsched/
├─ cannadex/
├─ cannapedia/
├─ carter/
├─ casbra/
├─ cdrc/
├─ cees-chirp/
├─ cgai/
├─ chappievc/
├─ character-generator/
├─ character-rng/
├─ coreshim/
├─ courtlistener-ac/
├─ cryptainer/
├─ cyberchefapk/
├─ cyberchefapk-offline/
├─ cyberchefapk-online/
├─ cyberchefapk-server/
├─ cyberchefkit/
│  ├─ cyberchefbash/
│  ├─ cyberchefbat/
│  ├─ cyberchefc/
│  ├─ cyberchefcpp/
│  ├─ cyberchefcsharp/
│  ├─ cyberchefcss/
│  ├─ cyberchefcy/
│  ├─ cyberchefgo/
│  ├─ cyberchefhtml/
│  ├─ cyberchefjava/
│  ├─ cyberchefjs/
│  ├─ cyberchefkt/
│  ├─ cybercheflua/
│  ├─ cyberchefmpy/
│  ├─ cyberchefperl/
│  ├─ cyberchefphp/
│  ├─ cyberchefps/
│  ├─ cyberchefpy/
│  ├─ cyberchefr/
│  ├─ cyberchefrb/
│  ├─ cyberchefrs/
│  ├─ cyberchefswift/
│  └─ cyberchefts/
├─ cyberconcubine/
├─ dabtimer/
├─ dabtimer-apk/
├─ davinci/
├─ ddt/
├─ deadbeefid/
├─ dhama/
├─ dharma-lab/
├─ dicelocks/
├─ discord-downgrader/
├─ emigna/
├─ expanded-diceware-volumes/
├─ eyebreaker/
├─ eyebreaker-apk/
├─ far/
├─ fartinajar/
├─ fcpc/
├─ fieldrecorder/
├─ fieldrecorder-apk/
├─ fivetrace/
├─ flyr/
├─ freedomgewse/
│  ├─ freedomgewsecex/
│  └─ freedomgewsedex/
├─ freedomkobra/
│  ├─ freedomkobracex/
│  └─ freedomkobradex/
├─ freedomx/
├─ fullnode-scraper/
├─ gameo/
├─ gardenharvester/
├─ gbb/
├─ geoadd/
├─ ggai/
├─ gks/
├─ gnee/
├─ gomle/
├─ gp/
├─ gpai/
├─ gpgai/
├─ greywave/
├─ gridhub/
├─ gsk/
├─ gutorcal/
├─ gwalr/
├─ gwen/
├─ hasher/
├─ hashpig/
├─ huah/
├─ hydrame/
├─ hydrameapk/
├─ iching/
├─ imaghee/
├─ isn/
│  ├─ isan/
│  ├─ isrn/
│  ├─ istv/
│  └─ isvn/
├─ kermits-trident/
├─ keykey/
├─ kinkiju/
├─ kinkiju-apk/
├─ kinkr/
├─ kyky/
├─ lexiphor/
├─ lightninglotto/
├─ luminaobscura/
├─ lunapy/
├─ lunapycam/
├─ lunar-clock/
├─ magneta/
├─ maliplib/
├─ mantrabox/
├─ marvis/
├─ marvis-rngvg/
├─ md2pdf/
├─ memeantix/
│  ├─ cwg/
│  ├─ fso/
│  ├─ peg/
│  └─ sdo/
├─ mempoolspecs/
├─ merlin/
├─ metatagdb/
├─ mnemonic-generator/
├─ mozlib/
├─ mu3u/
├─ nameprobe/
├─ naturava/
├─ neville/
├─ nginxapk/
├─ nodepix/
├─ npdquery/
├─ nutrame/
├─ nutrameapk/
├─ ob1wan/
├─ openterra-workstation/
├─ osci/
├─ otto/
├─ ownmap/
├─ ownmap-apk/
├─ parallel-explorer/
├─ pce/
├─ pictocrypt/
├─ pixelpixie/
├─ pixiegif/
├─ pixiepixel/
├─ pixiesprite/
├─ polyhedra/
├─ polyorbit/
├─ portraitgen/
├─ primenumhexgenseq/
├─ prngbignum/
├─ project-mongoose/
│  └─ tracy/
├─ projectops/
├─ proner/
├─ proneros/
├─ prototag/
├─ pryatki/
├─ pttp/
├─ pwrp/
├─ pymatrix/
├─ pyos/
├─ pytimecard/
├─ pytimecard-apk/
├─ qtard/
├─ railguru/
├─ ramanujan/
├─ randpassgeneratorkit/
├─ randwiki/
├─ rcalc/
├─ realintel/
├─ redlist/
├─ resrou/
├─ rgbrng/
├─ rosebud/
├─ rosebud-apk/
├─ s7sentinel/
├─ safai_karta/
├─ saptacrypt/
├─ scopez/
│  ├─ behaviorscope/
│  ├─ bitcoinscope/
│  ├─ datascope/
│  ├─ devicescope/
│  ├─ domainscope/
│  ├─ emailscope/
│  ├─ geoscope/
│  ├─ identityscope/
│  ├─ ipscope/
│  ├─ linkscope/
│  ├─ macscope/
│  ├─ netscope/
│  ├─ signalscope/
│  ├─ telecomscope/
│  ├─ timescope/
│  └─ userscope/
├─ scuzzlebutt/
├─ sd-gui/
├─ shairi_badalna/
├─ shaka-kahn/
├─ soiva/
├─ sparrownet/
├─ speciedex/
├─ speciedexapi/
├─ speciedexapp/
├─ speciedexarchives/
├─ speciedexcore/
├─ speciedexexplorer/
├─ speciedexgeneticbank/
├─ speciedexnet/
├─ speciedexterminal/
├─ speciedexweb/
├─ spp/
├─ sputnik/
├─ starindb/
├─ stegomicrodot/
├─ stephenizer/
├─ stirng/
├─ stoa/
├─ strainstringdb/
├─ stubler/
├─ subcircus/
├─ supercleaner/
├─ synthlavarng/
├─ t4np/
│  ├─ amurtiger/
│  ├─ arabianleopard/
│  ├─ manchuriantiger/
│  ├─ markhorsheep/
│  ├─ nubianibex/
│  ├─ persianleopard/
│  ├─ redpanda/
│  └─ westafricanlion/
├─ taktychna-mapa/
├─ tervis/
├─ tervis-rngvg/
├─ thumbzilla/
├─ tibetsgate/
├─ tldr/
├─ trackertally/
├─ trackertally-apk/
├─ tripforge/
├─ trustfun/
├─ tycho/
├─ urlscraper-firefox-browser-addon/
├─ uuidgen/
├─ videosort/
├─ vidghee/
├─ vidtag/
├─ vidunisui/
├─ vikram/
├─ vishal/
├─ vishnu/
├─ vlc-alarmclock/
├─ vlc-ticker/
├─ vlc2discordstatus/
├─ vmc/
├─ vmf/
├─ voise/
├─ vqr/
├─ vvardriving/
├─ warpdrive/
├─ wendelizer/
├─ wikispeciescore/
├─ wiper/
├─ wirefeed/
├─ woclock/
├─ woise/
├─ wordharvest/
├─ wordsofsatoshi/
├─ wyty/
├─ xconstats/
├─ ytrp/
├─ z64/
├─ zerox/
├─ zira/
├─ zmatrix/
├─ zorean-3d6-plus/
├─ zorean-ritual-altar/
├─ zorean-tablet-studio/
├─ zoreforge/
├─ zzx-bcf/
├─ zzx-bitcoin-ticker/
├─ zzx-github-stats/
├─ zzx-live-gif-widget/
├─ zzx-mempool-visualizer/
├─ zzx-pass/
├─ zzx-worldfactbook/
├─ zzx0gp/
├─ zzxasb/
├─ zzxbbc/
├─ zzxbcs/
├─ zzxbitnodes/
│  └─ maphost/
├─ zzxblogpost/
├─ zzxblogpost-apk/
├─ zzxcex/
├─ zzxcore/
├─ zzxdes/
├─ zzxdex/
├─ zzxffk/
├─ zzxgcs/
├─ zzxkld/
├─ zzxloss-bb/
├─ zzxmsp/
├─ zzxosc/
├─ zzxpp/
├─ zzxsbs/
├─ zzxsss/
├─ zzxsst/
├─ zzxstt/
├─ zzxtas/
├─ zzxtts/
├─ zzxvcs/
└─ zzxvss/
```

## Nested route families

The current manifest contains 9 route roots with nested canonical entries:

- [`cyberchefkit/`](./cyberchefkit/) — 23 nested canonical routes
- [`freedomgewse/`](./freedomgewse/) — 2 nested canonical routes
- [`freedomkobra/`](./freedomkobra/) — 2 nested canonical routes
- [`isn/`](./isn/) — 4 nested canonical routes
- [`memeantix/`](./memeantix/) — 4 nested canonical routes
- [`project-mongoose/`](./project-mongoose/) — 1 nested canonical route
- [`scopez/`](./scopez/) — 16 nested canonical routes
- [`t4np/`](./t4np/) — 8 nested canonical routes
- [`zzxbitnodes/`](./zzxbitnodes/) — 1 nested canonical route

Additional suites may express logical `parent` or suite relationships without nesting their canonical route.

## Navigation quickstart

Use the alphabetical index for fast navigation, or use the complete catalog table below for version/status/platform metadata.

**0–9 / Symbols** — [`4-4`](./4-4/) · [`4-4-apk`](./4-4-apk/) · [`4dv`](./4dv/)
**A** — [`adrenochrome`](./adrenochrome/) · [`aegissim`](./aegissim/) · [`ahab`](./ahab/) · [`aipdabe`](./aipdabe/) · [`air2w3w`](./air2w3w/) · [`alexberossusgpt`](./alexberossusgpt/) · [`ambergris`](./ambergris/) · [`amurtiger`](./t4np/amurtiger/) · [`androidpp`](./androidpp/) · [`arabianleopard`](./t4np/arabianleopard/) · [`archivetagger`](./archivetagger/) · [`astral-clock`](./astral-clock/) · [`audio-tagger`](./audio-tagger/) · [`audiolab`](./audiolab/) · [`audiosieve`](./audiosieve/)
**B** — [`backabit`](./backabit/) · [`backinabit`](./backinabit/) · [`backnabit`](./backnabit/) · [`balaklavabuilder3d`](./balaklavabuilder3d/) · [`base48-bdef`](./base48-bdef/) · [`bealeforce`](./bealeforce/) · [`beefs-diceware-wordlists`](./beefs-diceware-wordlists/) · [`beefs-rngs`](./beefs-rngs/) · [`beetlee`](./beetlee/) · [`behaviorscope`](./scopez/behaviorscope/) · [`berossus`](./berossus/) · [`berossusvoiceai`](./berossusvoiceai/) · [`bhopal-calc`](./bhopal-calc/) · [`bit-clock`](./bit-clock/) · [`bit-monitor`](./bit-monitor/) · [`bit-tick`](./bit-tick/) · [`bit-tracker`](./bit-tracker/) · [`bitage`](./bitage/) · [`bitarmor`](./bitarmor/) · [`bitavg`](./bitavg/) · [`bitbetting`](./bitbetting/) · [`bitbilling`](./bitbilling/) · [`bitbroker`](./bitbroker/) · [`bitburn`](./bitburn/) · [`bitcasino`](./bitcasino/) · [`bitcoin-mined`](./bitcoin-mined/) · [`bitcoin-tully`](./bitcoin-tully/) · [`bitcoinees`](./bitcoinees/) · [`bitcoinscope`](./scopez/bitcoinscope/) · [`bitcontract`](./bitcontract/) · [`bitcontractor`](./bitcontractor/) · [`bitdroid`](./bitdroid/) · [`bitescrow`](./bitescrow/) · [`bitfig`](./bitfig/) · [`bitgaming`](./bitgaming/) · [`bitjack`](./bitjack/) · [`bitlegal`](./bitlegal/) · [`bitlotto`](./bitlotto/) · [`bitonion`](./bitonion/) · [`bitpav`](./bitpav/) · [`bitpet`](./bitpet/) · [`bitrng`](./bitrng/) · [`bittrackit`](./bittrackit/) · [`bittrader`](./bittrader/) · [`blackbat`](./blackbat/) · [`blackbook`](./blackbook/) · [`blackpearl`](./blackpearl/) · [`blekrat`](./blekrat/) · [`blinkeeqr`](./blinkeeqr/) · [`blk2txt`](./blk2txt/) · [`blockclock`](./blockclock/) · [`blockclock-apk`](./blockclock-apk/) · [`bofs`](./bofs/) · [`borq`](./borq/) · [`bvtp`](./bvtp/)
**C** — [`calsched`](./calsched/) · [`cannadex`](./cannadex/) · [`cannapedia`](./cannapedia/) · [`carter`](./carter/) · [`casbra`](./casbra/) · [`cdrc`](./cdrc/) · [`cees-chirp`](./cees-chirp/) · [`cgai`](./cgai/) · [`chappievc`](./chappievc/) · [`character-generator`](./character-generator/) · [`character-rng`](./character-rng/) · [`coreshim`](./coreshim/) · [`courtlistener-ac`](./courtlistener-ac/) · [`cryptainer`](./cryptainer/) · [`cyberchefapk`](./cyberchefapk/) · [`cyberchefapk-offline`](./cyberchefapk-offline/) · [`cyberchefapk-online`](./cyberchefapk-online/) · [`cyberchefapk-server`](./cyberchefapk-server/) · [`cyberchefbash`](./cyberchefkit/cyberchefbash/) · [`cyberchefbat`](./cyberchefkit/cyberchefbat/) · [`cyberchefc`](./cyberchefkit/cyberchefc/) · [`cyberchefcpp`](./cyberchefkit/cyberchefcpp/) · [`cyberchefcsharp`](./cyberchefkit/cyberchefcsharp/) · [`cyberchefcss`](./cyberchefkit/cyberchefcss/) · [`cyberchefcy`](./cyberchefkit/cyberchefcy/) · [`cyberchefgo`](./cyberchefkit/cyberchefgo/) · [`cyberchefhtml`](./cyberchefkit/cyberchefhtml/) · [`cyberchefjava`](./cyberchefkit/cyberchefjava/) · [`cyberchefjs`](./cyberchefkit/cyberchefjs/) · [`cyberchefkit`](./cyberchefkit/) · [`cyberchefkt`](./cyberchefkit/cyberchefkt/) · [`cybercheflua`](./cyberchefkit/cybercheflua/) · [`cyberchefmpy`](./cyberchefkit/cyberchefmpy/) · [`cyberchefperl`](./cyberchefkit/cyberchefperl/) · [`cyberchefphp`](./cyberchefkit/cyberchefphp/) · [`cyberchefps`](./cyberchefkit/cyberchefps/) · [`cyberchefpy`](./cyberchefkit/cyberchefpy/) · [`cyberchefr`](./cyberchefkit/cyberchefr/) · [`cyberchefruby`](./cyberchefkit/cyberchefrb/) · [`cyberchefrust`](./cyberchefkit/cyberchefrs/) · [`cyberchefswift`](./cyberchefkit/cyberchefswift/) · [`cyberchefts`](./cyberchefkit/cyberchefts/) · [`cyberconcubine`](./cyberconcubine/)
**D** — [`dabtimer`](./dabtimer/) · [`dabtimer-apk`](./dabtimer-apk/) · [`datascope`](./scopez/datascope/) · [`davinci`](./davinci/) · [`ddt`](./ddt/) · [`deadbeefid`](./deadbeefid/) · [`devicescope`](./scopez/devicescope/) · [`dhama`](./dhama/) · [`dharma-lab`](./dharma-lab/) · [`dicelocks`](./dicelocks/) · [`discord-downgrader`](./discord-downgrader/) · [`domainscope`](./scopez/domainscope/)
**E** — [`emailscope`](./scopez/emailscope/) · [`emigna`](./emigna/) · [`expanded-diceware-volumes`](./expanded-diceware-volumes/) · [`eyebreaker`](./eyebreaker/) · [`eyebreaker-apk`](./eyebreaker-apk/)
**F** — [`far`](./far/) · [`fartinajar`](./fartinajar/) · [`fcpc`](./fcpc/) · [`fieldrecorder`](./fieldrecorder/) · [`fieldrecorder-apk`](./fieldrecorder-apk/) · [`fivetrace`](./fivetrace/) · [`flyr`](./flyr/) · [`freedomgewse`](./freedomgewse/) · [`freedomgewsecex`](./freedomgewse/freedomgewsecex/) · [`freedomgewsedex`](./freedomgewse/freedomgewsedex/) · [`freedomkobra`](./freedomkobra/) · [`freedomkobracex`](./freedomkobra/freedomkobracex/) · [`freedomkobradex`](./freedomkobra/freedomkobradex/) · [`freedomx`](./freedomx/) · [`fullnode-scraper`](./fullnode-scraper/)
**G** — [`gameo`](./gameo/) · [`gardenharvester`](./gardenharvester/) · [`gbb`](./gbb/) · [`geoadd`](./geoadd/) · [`geoscope`](./scopez/geoscope/) · [`ggai`](./ggai/) · [`gks`](./gks/) · [`gnee`](./gnee/) · [`gomle`](./gomle/) · [`gp`](./gp/) · [`gpai`](./gpai/) · [`gpgai`](./gpgai/) · [`greywave`](./greywave/) · [`gridhub`](./gridhub/) · [`gsk`](./gsk/) · [`gutorcal`](./gutorcal/) · [`gwalr`](./gwalr/) · [`gwen`](./gwen/)
**H** — [`hasher`](./hasher/) · [`hashpig`](./hashpig/) · [`huah`](./huah/) · [`hydrame`](./hydrame/) · [`hydrameapk`](./hydrameapk/)
**I** — [`iching`](./iching/) · [`identityscope`](./scopez/identityscope/) · [`imaghee`](./imaghee/) · [`ipscope`](./scopez/ipscope/) · [`isan`](./isn/isan/) · [`isn`](./isn/) · [`isrn`](./isn/isrn/) · [`istv`](./isn/istv/) · [`isvn`](./isn/isvn/)
**K** — [`kermits-trident`](./kermits-trident/) · [`keykey`](./keykey/) · [`kinkiju`](./kinkiju/) · [`kinkiju-apk`](./kinkiju-apk/) · [`kinkr`](./kinkr/) · [`kyky`](./kyky/)
**L** — [`lexiphor`](./lexiphor/) · [`lightninglotto`](./lightninglotto/) · [`linkscope`](./scopez/linkscope/) · [`luminaobscura`](./luminaobscura/) · [`lunapy`](./lunapy/) · [`lunapycam`](./lunapycam/) · [`lunar-clock`](./lunar-clock/)
**M** — [`macscope`](./scopez/macscope/) · [`magneta`](./magneta/) · [`maliplib`](./maliplib/) · [`manchuriantiger`](./t4np/manchuriantiger/) · [`mantrabox`](./mantrabox/) · [`markhorsheep`](./t4np/markhorsheep/) · [`marvis`](./marvis/) · [`marvis-rngvg`](./marvis-rngvg/) · [`md2pdf`](./md2pdf/) · [`memeantix`](./memeantix/) · [`memeantix-cwg`](./memeantix/cwg/) · [`memeantix-fso`](./memeantix/fso/) · [`memeantix-peg`](./memeantix/peg/) · [`memeantix-sdo`](./memeantix/sdo/) · [`mempoolspecs`](./mempoolspecs/) · [`merlin`](./merlin/) · [`metatagdb`](./metatagdb/) · [`mnemonic-generator`](./mnemonic-generator/) · [`mozlib`](./mozlib/) · [`mu3u`](./mu3u/)
**N** — [`nameprobe`](./nameprobe/) · [`naturava`](./naturava/) · [`netscope`](./scopez/netscope/) · [`neville`](./neville/) · [`nginxapk`](./nginxapk/) · [`nodepix`](./nodepix/) · [`npdquery`](./npdquery/) · [`nubianibex`](./t4np/nubianibex/) · [`nutrame`](./nutrame/) · [`nutrameapk`](./nutrameapk/)
**O** — [`ob1wan`](./ob1wan/) · [`openterra-workstation`](./openterra-workstation/) · [`osci`](./osci/) · [`otto`](./otto/) · [`ownmap`](./ownmap/) · [`ownmap-apk`](./ownmap-apk/)
**P** — [`parallel-explorer`](./parallel-explorer/) · [`pce`](./pce/) · [`persianleopard`](./t4np/persianleopard/) · [`pictocrypt`](./pictocrypt/) · [`pixelpixie`](./pixelpixie/) · [`pixiegif`](./pixiegif/) · [`pixiepixel`](./pixiepixel/) · [`pixiesprite`](./pixiesprite/) · [`polyhedra`](./polyhedra/) · [`polyorbit`](./polyorbit/) · [`portraitgen`](./portraitgen/) · [`primenumhexgenseq`](./primenumhexgenseq/) · [`prngbignum`](./prngbignum/) · [`project-mongoose`](./project-mongoose/) · [`projectops`](./projectops/) · [`proner`](./proner/) · [`proneros`](./proneros/) · [`prototag`](./prototag/) · [`pryatki`](./pryatki/) · [`pttp`](./pttp/) · [`pwrp`](./pwrp/) · [`pymatrix`](./pymatrix/) · [`pyos`](./pyos/) · [`pytimecard`](./pytimecard/) · [`pytimecard-apk`](./pytimecard-apk/)
**Q** — [`qtard`](./qtard/)
**R** — [`railguru`](./railguru/) · [`ramanujan`](./ramanujan/) · [`randpassgeneratorkit`](./randpassgeneratorkit/) · [`randwiki`](./randwiki/) · [`rcalc`](./rcalc/) · [`realintel`](./realintel/) · [`redlist`](./redlist/) · [`redpanda`](./t4np/redpanda/) · [`resrou`](./resrou/) · [`rgbrng`](./rgbrng/) · [`rosebud`](./rosebud/) · [`rosebud-apk`](./rosebud-apk/)
**S** — [`s7sentinel`](./s7sentinel/) · [`safai_karta`](./safai_karta/) · [`saptacrypt`](./saptacrypt/) · [`scopez`](./scopez/) · [`scuzzlebutt`](./scuzzlebutt/) · [`sd-gui`](./sd-gui/) · [`shairi_badalna`](./shairi_badalna/) · [`shaka-kahn`](./shaka-kahn/) · [`signalscope`](./scopez/signalscope/) · [`soiva`](./soiva/) · [`sparrownet`](./sparrownet/) · [`speciedex`](./speciedex/) · [`speciedexapi`](./speciedexapi/) · [`speciedexapp`](./speciedexapp/) · [`speciedexarchives`](./speciedexarchives/) · [`speciedexcore`](./speciedexcore/) · [`speciedexexplorer`](./speciedexexplorer/) · [`speciedexgeneticbank`](./speciedexgeneticbank/) · [`speciedexnet`](./speciedexnet/) · [`speciedexterminal`](./speciedexterminal/) · [`speciedexweb`](./speciedexweb/) · [`spp`](./spp/) · [`sputnik`](./sputnik/) · [`starindb`](./starindb/) · [`stegomicrodot`](./stegomicrodot/) · [`stephenizer`](./stephenizer/) · [`stirng`](./stirng/) · [`stoa`](./stoa/) · [`strainstringdb`](./strainstringdb/) · [`stubler`](./stubler/) · [`subcircus`](./subcircus/) · [`supercleaner`](./supercleaner/) · [`synthlavarng`](./synthlavarng/)
**T** — [`t4np`](./t4np/) · [`taktychna-mapa`](./taktychna-mapa/) · [`telecomscope`](./scopez/telecomscope/) · [`tervis`](./tervis/) · [`tervis-rngvg`](./tervis-rngvg/) · [`thumbzilla`](./thumbzilla/) · [`tibetsgate`](./tibetsgate/) · [`timescope`](./scopez/timescope/) · [`tldr`](./tldr/) · [`trackertally`](./trackertally/) · [`trackertally-apk`](./trackertally-apk/) · [`tracy`](./project-mongoose/tracy/) · [`tripforge`](./tripforge/) · [`trustfun`](./trustfun/) · [`tycho`](./tycho/)
**U** — [`urlscraper-firefox-browser-addon`](./urlscraper-firefox-browser-addon/) · [`userscope`](./scopez/userscope/) · [`uuidgen`](./uuidgen/)
**V** — [`videosort`](./videosort/) · [`vidghee`](./vidghee/) · [`vidtag`](./vidtag/) · [`vidunisui`](./vidunisui/) · [`vikram`](./vikram/) · [`vishal`](./vishal/) · [`vishnu`](./vishnu/) · [`vlc-alarmclock`](./vlc-alarmclock/) · [`vlc-ticker`](./vlc-ticker/) · [`vlc2discordstatus`](./vlc2discordstatus/) · [`vmc`](./vmc/) · [`vmf`](./vmf/) · [`voise`](./voise/) · [`vqr`](./vqr/) · [`vvardriving`](./vvardriving/)
**W** — [`warpdrive`](./warpdrive/) · [`wendelizer`](./wendelizer/) · [`westafricanlion`](./t4np/westafricanlion/) · [`wikispeciescore`](./wikispeciescore/) · [`wiper`](./wiper/) · [`wirefeed`](./wirefeed/) · [`woclock`](./woclock/) · [`woise`](./woise/) · [`wordharvest`](./wordharvest/) · [`wordsofsatoshi`](./wordsofsatoshi/) · [`wyty`](./wyty/)
**X** — [`xconstats`](./xconstats/)
**Y** — [`ytrp`](./ytrp/)
**Z** — [`z64`](./z64/) · [`zerox`](./zerox/) · [`zira`](./zira/) · [`zmatrix`](./zmatrix/) · [`zorean-3d6-plus`](./zorean-3d6-plus/) · [`zorean-ritual-altar`](./zorean-ritual-altar/) · [`zorean-tablet-studio`](./zorean-tablet-studio/) · [`zoreforge`](./zoreforge/) · [`zzx-bcf`](./zzx-bcf/) · [`zzx-bitcoin-ticker`](./zzx-bitcoin-ticker/) · [`zzx-github-stats`](./zzx-github-stats/) · [`zzx-live-gif-widget`](./zzx-live-gif-widget/) · [`zzx-mempool-visualizer`](./zzx-mempool-visualizer/) · [`zzx-pass`](./zzx-pass/) · [`zzx-worldfactbook`](./zzx-worldfactbook/) · [`zzx0gp`](./zzx0gp/) · [`zzxasb`](./zzxasb/) · [`zzxbbc`](./zzxbbc/) · [`zzxbcs`](./zzxbcs/) · [`zzxbitnodes`](./zzxbitnodes/) · [`zzxbitnodes-maphost`](./zzxbitnodes/maphost/) · [`zzxblogpost`](./zzxblogpost/) · [`zzxblogpost-apk`](./zzxblogpost-apk/) · [`zzxcex`](./zzxcex/) · [`zzxcore`](./zzxcore/) · [`zzxdes`](./zzxdes/) · [`zzxdex`](./zzxdex/) · [`zzxffk`](./zzxffk/) · [`zzxgcs`](./zzxgcs/) · [`zzxkld`](./zzxkld/) · [`zzxloss-bb`](./zzxloss-bb/) · [`zzxmsp`](./zzxmsp/) · [`zzxosc`](./zzxosc/) · [`zzxpp`](./zzxpp/) · [`zzxsbs`](./zzxsbs/) · [`zzxsss`](./zzxsss/) · [`zzxsst`](./zzxsst/) · [`zzxstt`](./zzxstt/) · [`zzxtas`](./zzxtas/) · [`zzxtts`](./zzxtts/) · [`zzxvcs`](./zzxvcs/) · [`zzxvss`](./zzxvss/)

## Complete software catalog

| # | Project | Slug | Version | Status | Platforms | Canonical route | Summary |
|---:|---|---|---|---|---|---|---|
| 001 | [4DV (Four-Dimensional Video System)](./4dv/) | `4dv` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/4dv/` | 4DV adds metadata and contextual content layers to existing videos, allowing audio, video, or text commentary tracks to be overlaid as dynamic time-based layers. Enables creators, educators, and analysts to embed synchronized annotations, commentary, and insights into any media file without altering the original source. Acts as a multi-track temporal augmentation and metadata enrichment system for video archives and presentations. |
| 002 | [4⁴](./4-4/) | `4-4` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/4-4/` | (4-4-4-4 / Box Breathing Clock) - Guided respiration timer based on the US Navy SEAL's 4-4-4-4 box breathing technique; visual and haptic cues for inhale, hold, exhale, hold cycles. Ideal for stress reduction and focus training. |
| 003 | [4⁴ Breath (APK)](./4-4-apk/) | `4-4-apk` | `1.0.0` | `stable` | Android | `/projects/software/4-4-apk/` | (4-4-4-4 / Box Breathing Clock) — Native Android APK implementing the US Navy SEAL 4-4-4-4 box breathing protocol with visual timing cues, haptic feedback, and offline-first operation. |
| 004 | [Adrenochrome](./adrenochrome/) | `adrenochrome` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/adrenochrome/` | Cryptographic/document signature and identity-provenance tooling for generating and validating signed manifests, identity artifacts, and authenticity metadata. |
| 005 | [AegisSim](./aegissim/) | `aegissim` | `0.3.0` | `alpha` | Linux, Windows, macOS | `/projects/software/aegissim/` | Programmable multi-domain physics and sensor simulation environment for air, ground, surface, and submersible vehicles, with 6-DOF motion, terrain/ocean/weather models, collisions, Monte Carlo experimentation, GPU rendering, and machine-learning adapters. |
| 006 | [Ahab](./ahab/) | `ahab` | `1.1.0` | `alpha` | Linux, Windows, macOS | `/projects/software/ahab/` | Bitcoin whale and large-value activity research workstation that scans public/raw block data and exposes PyQt5 GUI/CLI analysis, with public explorer fallback providers for validation and enrichment. |
| 007 | [AIPDABE (AI Personal Digital Assistant for Bitcoin Exploration)](./aipdabe/) | `aipdabe` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/aipdabe/` | AI-powered Bitcoin block exploration and analysis engine integrating blockchain parsing, transaction tracing, and mempool intelligence. Uses adaptive language and ML models to interpret Bitcoin Core data, visualize UTXO flows, and provide human-readable summaries of on-chain activity. Designed as a personal research assistant for blockchain analytics, cryptography, and financial forensics. |
| 008 | [Air2W3W](./air2w3w/) | `air2w3w` | `1.0.1` | `alpha` | Linux, Windows, macOS | `/projects/software/air2w3w/` | Python/PyQt5 GUI and CLI for identifying aircraft near a user-supplied what3words square and local timestamp through public flight/aircraft data, with geohash/corner calculations and no dependence on device GPS or browser/IP geolocation. |
| 009 | [AlexBerossusGPT](./alexberossusgpt/) | `alexberossusgpt` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/alexberossusgpt/` | AI-driven research assistant system for blockchain, intelligence, and deep data exploration. Integrates GPT-style models with retrieval-augmented generation, corpus indexing, and multi-domain protocol drafting. Designed for reproducible investigations and adaptive analytic workflows across Berossus archives. |
| 010 | [Ambergris](./ambergris/) | `ambergris` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/ambergris/` | Time-signed, hash-chained release-authenticity and archival provenance file/system for verifying release history and preservation integrity. |
| 011 | [AmurTiger](./t4np/amurtiger/) | `amurtiger` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/t4np/amurtiger/` | AmurTiger is the Russia-focused T4NP module, applying jurisdiction-tuned lexical and structural encodings that frustrate automated tooling, redistribution, and compliant reuse within Russian legal and linguistic environments. |
| 012 | [Android++](./androidpp/) | `androidpp` | `0.6.0-alpha` | `alpha` | Android, Web | `/projects/software/androidpp/` | Offline Android code editor inspired by Notepad++ with GPG encryption workflows and CyberChef-style transformations for local analysis and secure note-taking. |
| 013 | [ArabianLeopard](./t4np/arabianleopard/) | `arabianleopard` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/t4np/arabianleopard/` | ArabianLeopard is the Saudi Arabia-focused T4NP jurisdiction profile for defensive source-distribution controls, provenance enforcement, release gating, and build-policy checks in Saudi deployment contexts. |
| 014 | [ArchiveTagger](./archivetagger/) | `archivetagger` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali, Web | `/projects/software/archivetagger/` | ArchiveTagger automates tagging, indexing, and metadata extraction across large offline and online datasets. Supports text, audio, video, and image archives with content fingerprinting, optical character recognition, and keyword taxonomy mapping for digital preservation, research analytics, and AI dataset structuring. |
| 015 | [Astral Clock (Universal Time System)](./astral-clock/) | `astral-clock` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/astral-clock/` | Astral Clock defines a single unified time standard for the entire known universe — synchronizing clocks between Earth, its Moon, Mars, Ganymede, and other celestial bodies. It calculates orbital drift, gravitational offset, and signal delay to establish an exact shared time across planets, moons, stars, and galaxies. Designed for space navigation, interplanetary coordination, and future off-world civilization infrastructure. |
| 016 | [AudioLab](./audiolab/) | `audiolab` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/audiolab/` | AudioLab is an experimental sound design and analysis environment for waveform generation, signal processing, and multi-track manipulation. It provides tools for synthesis, spectral visualization, recording, filtering, and effects chaining — all within a modular PyQt5 interface. Designed for researchers, producers, and developers exploring audio physics, acoustics, and AI-driven sonic experimentation. |
| 017 | [AudioSieve](./audiosieve/) | `audiosieve` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/audiosieve/` | AudioSieve is a cross-platform music library workstation integrating VLC playback, FFmpeg processing, and Mutagen metadata editing. It provides waveform visualization, audio output routing, playlist management, and tag editing with a PyQt5 GUI that mirrors VLC’s native transport controls. Designed for professional music cataloging, playback, and tagging across multi-device environments. |
| 018 | [AudioTagger](./audio-tagger/) | `audio-tagger` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/audio-tagger/` | AudioTagger is an automated audio metadata tagging and cataloging engine for music libraries and archival collections. It extracts and normalizes ID3 and embedded metadata, performs audio fingerprinting, and connects to online databases for track recognition. Integrates with beets and Mutagen for consistent metadata control across large collections and supports batch tagging, cleanup, and export in JSON or YAML formats. |
| 019 | [BackABit](./backabit/) | `backabit` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/backabit/` | BackABit is a Bitcoin-native savings and capital structuring system that orchestrates layered financial strategies across short-, medium-, and long-term horizons. It integrates BackNABit (liquidity layer) and BackInABit (deep savings layer) to provide deterministic accumulation, time-locked growth, and structured capital deployment using Bitcoin as the base asset. |
| 020 | [BackInABit](./backinabit/) | `backinabit` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/backinabit/` | BackInABit is the long-term capital preservation layer of the BackABit system, designed for 10–20 year Bitcoin holdings. It implements time locks, multisig vaulting, cold storage integration, and policy-based withdrawal constraints to enforce disciplined accumulation and intergenerational wealth preservation. |
| 021 | [BackNABit](./backnabit/) | `backnabit` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/backnabit/` | BackNABit is the short-term liquidity layer of the BackABit system, functioning analogously to a Bitcoin checking account. It manages active spending, rapid transfers, Lightning Network interactions, and operational cash flow while maintaining traceability, budgeting controls, and real-time balance analytics. |
| 022 | [BalaklavaBuilder3D](./balaklavabuilder3d/) | `balaklavabuilder3d` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/balaklavabuilder3d/` | Auditable heritage-reconstruction workbench for building a 3D model from pre-2014 public archival evidence, terrain and map data, imagery, dimensional records, and source-linked observations, with mesh and PDF blueprint exports. |
| 023 | [Base48 (NoCSPAM) / BDEF](./base48-bdef/) | `base48-bdef` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/base48-bdef/` | Base48 (NoCSPAM), also known as Base48-BDEF, is a deterministic binary-to-text encoding derived from Bitcoin’s Base58 alphabet with C/c, S/s, P/p, A/a, and M/m removed. Designed as both a fully functional encoding scheme and a satirical commentary on representation-layer "solutions" to network-layer debates, Base48 encodes arbitrary bytes and UTF-8 plaintext using a 48-character canonical alphabet. Includes multi-language reference implementations (C, C++, C#, Go, Java, JavaScript, Python, Bash) and a unified CLI + PyQt5 GUI wrapper. |
| 024 | [BealeForce](./bealeforce/) | `bealeforce` | `1.0.0` | `alpha` | Linux, Windows, macOS | `/projects/software/bealeforce/` | Beale-cipher research and corpus-analysis workbench with PyQt5 GUI/CLI, calibration, multiprocessing/sharding, candidate ranking, SQLite persistence, and explicit separation between verified source material and user-supplied transcriptions. |
| 025 | [beef's Diceware Wordlists](./beefs-diceware-wordlists/) | `beefs-diceware-wordlists` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/beefs-diceware-wordlists/` | Cryptographically-signed, locale-aware Diceware wordlists (7,776 words) and tooling for deterministic, printable offline passphrases and entropy audits. |
| 026 | [beef's RNGs](./beefs-rngs/) | `beefs-rngs` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/beefs-rngs/` | Suite of RNG implementations and test-vectors (Bash, C/C++, Python) with entropy collectors, bias tests, and reproducible audit logs for offline cryptographic seeding. |
| 027 | [Beetlee](./beetlee/) | `beetlee` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/beetlee/` | Multidimensional artificial-life and swarm simulation environment for species, behavior, interaction, visualization, and machine-learning experimentation. |
| 028 | [BehaviorScope](./scopez/behaviorscope/) | `behaviorscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/behaviorscope/` | Behavioral analysis system identifying patterns in activity, usage, and interaction across digital systems. |
| 029 | [Berossus](./berossus/) | `berossus` | `0.3.0-beta` | `beta` | Linux, Windows, macOS | `/projects/software/berossus/` | Corpus-building and retrieval pipelines for domain-specific LLM tooling providing ingestion, dedupe, chunking, vector embeddings, and evaluation suites for controlled model fine-tuning. |
| 030 | [BerossusVoiceAI](./berossusvoiceai/) | `berossusvoiceai` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/berossusvoiceai/` | Modular TTS/STT stack for Berossus: diarization, alignment, multi-voice synthesis, and orchestration tooling for dataset creation and controlled voice generation. |
| 031 | [BHOPAL Calc](./bhopal-calc/) | `bhopal-calc` | `0.1.0` | `stable` | Linux, Windows, macOS | `/projects/software/bhopal-calc/` | Cannabinoid content and dosing calculator GUI (Python) for estimating potency, terpene ratios, extraction yields, and safe dosing guidelines for lab & cultivation use. |
| 032 | [Bit-Clock](./bit-clock/) | `bit-clock` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/bit-clock/` | Bitcoin time & block-height clock—halving countdowns, epoch stats, subsidy and emission visualizer. |
| 033 | [Bit-Monitor](./bit-monitor/) | `bit-monitor` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/bit-monitor/` | Lightweight Bitcoin/LN monitor with node health, mempool, fee bands, and uptime alerts. |
| 034 | [Bit-Tick](./bit-tick/) | `bit-tick` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/bit-tick/` | Bitcoin price ticker. |
| 035 | [Bit-Tracker](./bit-tracker/) | `bit-tracker` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/bit-tracker/` | Address, UTXO, and transaction tracker with labeling, notes, and exportable audit trails. |
| 036 | [BitAge](./bitage/) | `bitage` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/bitage/` | System for empirical measurement and visualization of Bitcoin block time intervals — providing dual-backend analytics (Esplora API & Bitcoin Core RPC), rolling statistical windows, and PyQt5 GUI/CLI interfaces for blockchain temporal analysis. |
| 037 | [BitArmor](./bitarmor/) | `bitarmor` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/bitarmor/` | BitArmor is a hardened Bitcoin vault management and custody framework. It implements multi-layered timelocks, multisig authorization, HSM integration, and policy-based encryption for high-security storage. Supports cold wallets, escrow workflows, recovery manifests, and verifiable audit logs across CLI and PyQt5 GUI modes. |
| 038 | [BitAvg](./bitavg/) | `bitavg` | `0.2.0-beta` | `beta` | Linux, Windows, macOS, Kali | `/projects/software/bitavg/` | BitAvg is a global Bitcoin weighted-average price calculator that aggregates real-time spot data across major exchanges. It computes global market ratios by exchange volume and updates every ¼-second to maintain a live, volume-weighted, volatility-adjusted index. |
| 039 | [BitBetting](./bitbetting/) | `bitbetting` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitbetting/` | Provably-fair Bitcoin betting protocol built atop the BitContracts framework. Uses verifiable random seeds, on-chain proofs, and Lightning Network settlement channels for instant payout and transparency. Includes modular APIs for prediction markets and decentralized game logic. |
| 040 | [BitBilling](./bitbilling/) | `bitbilling` | `0.9.0-beta` | `beta` | Linux, Windows, macOS | `/projects/software/bitbilling/` | Bitcoin-native billing and invoicing system for consulting, contracting, retainers, and service operations. Focuses on auditable payment flows, per-invoice address generation, and offline-first recordkeeping. |
| 041 | [BitBroker](./bitbroker/) | `bitbroker` | `0.2.0-beta` | `beta` | Linux, Windows, macOS | `/projects/software/bitbroker/` | Programmable Bitcoin order-router and market microstructure toolkit. Enables automated accumulation, hedging, and rebalancing strategies across multiple exchanges and APIs. Used internally and externally by traders, institutions, and AI systems for long-term BTC accumulation and research-grade execution modeling. |
| 042 | [BitBurn](./bitburn/) | `bitburn` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitburn/` | BitBurn estimates the total volume of Bitcoin permanently lost through wallet disappearance, forgotten keys, and unspent outputs. It models loss ratios using UTXO age, transaction entropy, and chain inactivity metrics to visualize historical and projected Bitcoin supply reduction. |
| 043 | [BitCasino](./bitcasino/) | `bitcasino` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/bitcasino/` | BTC-native casino engine built on BitContracts with provably-fair game logic, modular plugin architecture, bankroll management, and player-side verification. Supports LN buy-ins, multisig reserves, and auditable randomness verification across integrated titles. |
| 044 | [Bitcoin EMIGNA Encoding System (BEES)](./bitcoinees/) | `bitcoinees` | `0.1.0-alpha` | `alpha` | Linux, Windows | `/projects/software/bitcoinees/` | Bitcoin-focused encryption framework using EMIGNA rotor mechanics for securing keys, seed phrases, and wallet data with layered cryptographic transformations. |
| 045 | [Bitcoin-Mined](./bitcoin-mined/) | `bitcoin-mined` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitcoin-mined/` | Minimalist, real-time Bitcoin circulation tracker & emission estimator (Python + PyQt5) using on-chain data. |
| 046 | [Bitcoin-Tully](./bitcoin-tully/) | `bitcoin-tully` | `0.1.0-alpha` | `alpha` | Windows | `/projects/software/bitcoin-tully/` | BitcoinCore/Knots wallet-finding & forensic backup tools (Bash & Python) for Windows 10 (cmder). |
| 047 | [BitcoinScope](./scopez/bitcoinscope/) | `bitcoinscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/bitcoinscope/` | Blockchain analysis engine for Bitcoin addresses, UTXOs, transactions, and temporal-spatial inference using network metadata and probabilistic clustering. |
| 048 | [BitContract](./bitcontract/) | `bitcontract` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitcontract/` | Bitcoin smart-contract templates (timelocks, multisig, DLCs) with code generators and tests. |
| 049 | [BitContractor](./bitcontractor/) | `bitcontractor` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitcontractor/` | Contract authoring and publishing suite for drafting hybrid legal and on-chain Bitcoin agreements. Integrates BitLegal and BitEscrow with signing, version control, notarization, and multi-user collaboration. Features template management, diff-based redlining, and export to PDF or JSON for blockchain notarization. |
| 050 | [BitDroid](./bitdroid/) | `bitdroid` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/bitdroid/` | Android and desktop Bitcoin Core/Lightning environment emphasizing user-owned infrastructure, local control, privacy, removable storage, and self-hosted node/wallet operations. |
| 051 | [BitEscrow](./bitescrow/) | `bitescrow` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/bitescrow/` | Multisig escrow protocol implementing milestone-based Bitcoin releases with arbitration and encrypted dispute evidence packs. Serves as the foundational layer for BitContracts, enabling secure transactional mediation between counterparties using 2-of-3 or N-of-M signing architectures. |
| 052 | [BitFig](./bitfig/) | `bitfig` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitfig/` | Bitcoin Core / Knots configuration designer — generate, validate, and deploy bitcoin.conf templates interactively (web, CLI, or GUI). Enables real-time parameter editing, syntax validation, and deployment to local or remote nodes with secure authentication and rollback support. |
| 053 | [BitGaming](./bitgaming/) | `bitgaming` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/bitgaming/` | Gaming layer for Bitcoin-based mechanics integrating provable odds, verifiable randomness, and LN payment rails. Designed for indie developers to embed BTC-native logic, leaderboards, and instant micropayments into existing games. |
| 054 | [BitJack](./bitjack/) | `bitjack` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/bitjack/` | Bitcoin blackjack engine under the BitCasino stack — LN buy-ins, provably-fair deck shuffling, and low-latency gameplay. Built with modular game logic and transparent randomness proofs for verifiable fairness and instant LN settlements. |
| 055 | [BitLegal](./bitlegal/) | `bitlegal` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitlegal/` | Legal contract automation framework connecting plain-language agreements to enforceable Bitcoin and Lightning actions. Provides signature binding, notarized contract hashes, and arbitration integration via BitEscrow for verifiable compliance and on-chain enforceability. |
| 056 | [BitLotto](./bitlotto/) | `bitlotto` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitlotto/` | BitLotto is a deterministic Bitcoin lottery engine built around escrow-style ticket commitments and provably fair drawings anchored to Bitcoin block hashes. Winning combinations are generated via reproducible cryptographic RNG, allowing any third party to independently verify results offline. The system supports GUI and CLI operation and is designed for auditability, replay, and long-term archival. |
| 057 | [BitOnion](./bitonion/) | `bitonion` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, iOS, Kali | `/projects/software/bitonion/` | Local Tor gateway & router for Bitcoin Core: automatic Tor/I2P/OpenVPN/proxychains routing, monitoring integrations (nmap, Wireshark), and cross-platform CLI + PyQt5 GUI for secure full-node operation. |
| 058 | [BitPav (Bitcoin Proof-of-Worth Tracker)](./bitpav/) | `bitpav` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitpav/` | BitPav — Bitcoin purchase and sale tracker analyzing portfolio growth or loss versus live market conditions. Uses Coinbase and other exchange APIs for spot pricing every ¼ second, computing per-entry percentage change, fee impact, and lifetime value metrics. Features PyQt5 GUI and CLI dashboard views with visual charts and color-coded profit/loss indicators. |
| 059 | [BitPet](./bitpet/) | `bitpet` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/bitpet/` | Bitcoin-integrated virtual pet ecosystem blending gamification, cryptography, and collectible economics. Each BitPet is a bitcoin blockchain-linked entity with evolving stats, behaviors, and attributes influenced by Lightning Network microtransactions, encrypted wallets, and training interactions. |
| 060 | [BitRNG](./bitrng/) | `bitrng` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bitrng/` | BitRNG is a cryptographically secure random number generator and entropy testing suite. It collects live entropy from Bitcoin block headers, transaction hashes, and network latency metrics, converting them into verifiable random seeds suitable for key generation, cryptography, and gaming applications. |
| 061 | [BitTrackIt](./bittrackit/) | `bittrackit` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/bittrackit/` | BitTrackIt monitors, logs, and visualizes Bitcoin transactions, addresses, and wallet balances in real time. It integrates multiple exchange and mempool APIs for on-chain monitoring, fee estimation, and portfolio tracking, with alerts and forensic tracing capabilities. |
| 062 | [BitTrader](./bittrader/) | `bittrader` | `0.8.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bittrader/` | Algorithmic Bitcoin trading research platform supporting backtesting, market condition analysis, strategy simulation, and controlled live-feed experimentation. |
| 063 | [BlackBat](./blackbat/) | `blackbat` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/blackbat/` | BlackBat is a suite of Bitcoin trading algorithms (BATS/ATSP) focused on long-term BTC accumulation with position sizing, drawdown limits, and multi-exchange risk controls. |
| 064 | [BlackBook](./blackbook/) | `blackbook` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, iOS | `/projects/software/blackbook/` | Encrypted private contact and profile management suite for secure, discreet storage of personal data, medical records, and verified relationship networks. Designed for privacy-conscious users within adult kink and BDSM communities. |
| 065 | [BlackPearl](./blackpearl/) | `blackpearl` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/blackpearl/` | Privacy-conscious turnkey website and publishing template for independent adult creators, with local media inspection, metadata-sanitization workflows, randomized public filenames, rights/release checkpoints, blog composition, and BTC-only custom development services. |
| 066 | [BlekRAT](./blekrat/) | `blekrat` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/blekrat/` | BlekRAT is a private, secure administrator’s remote-access toolkit for lab orchestration and testbeds, providing encrypted multi-host control channels, task automation, and audit logging for internal environments. |
| 067 | [Blinkee Optical File System (BOFS)](./bofs/) | `bofs` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/bofs/` | BOFS is a frame-sequenced optical file system that structures, indexes, and stores data across animated visual carriers such as BlinkeeQR sequences. It defines chunking, ordering, redundancy, and recovery mechanisms for encoding files into deterministic multi-frame visual datasets, including ISO-based container volumes and multi-sequence archives. |
| 068 | [Blinkee Visual Transport Protocol (BVTP)](./bvtp/) | `bvtp` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/bvtp/` | BVTP defines the transmission layer for Blinkee-based optical data systems, enabling reliable transport of frame-sequenced data across cameras, displays, and video streams. It handles synchronization, timing, packetization, loss recovery, buffering, and real-time decoding for optical communication channels. |
| 069 | [BlinkeeQR Encoding Standard (BQRES)](./blinkeeqr/) | `blinkeeqr` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/blinkeeqr/` | BlinkeeQR Encoding Standard (BQRES) defines a high-density visual encoding scheme using animated QR-like frames to represent binary data. It specifies symbol mapping, frame construction, error correction, and temporal sequencing for converting digital data into machine-readable optical patterns. |
| 070 | [blk2txt](./blk2txt/) | `blk2txt` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/blk2txt/` | blk2txt is an offline Bitcoin Core block file decoder that reads raw blocks/blk*.dat files directly from a local full node and converts them into deterministic, human-readable transaction-by-transaction text archives. It parses block headers, txids, wtxids, scripts, witness data, and output values, supports OP_RETURN memo extraction, and integrates a markers.json annotation system for historic blocks, transactions, outpoints, and addresses. Designed for forensic blockchain analysis, archival research, and reproducible offline chain inspection without third-party explorers. |
| 071 | [BlockClock](./blockclock/) | `blockclock` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/blockclock/` | Software system for monitoring Bitcoin network metrics including block height, mempool activity, and fee rates with real-time visualization and hardware integration support. |
| 072 | [BlockClock (APK)](./blockclock-apk/) | `blockclock-apk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/blockclock-apk/` | Android mobile version of BlockClock providing real-time Bitcoin network monitoring, alerts, and visualization on handheld devices. |
| 073 | [BORQ](./borq/) | `borq` | `1.0.2` | `alpha` | Linux, Windows, macOS | `/projects/software/borq/` | Unified GUI/CLI music toolkit for audio acquisition and analysis, ID3/BPM/key/Camelot/genre/structure processing, deterministic setlist construction, playlist generation, bridge creation, and ordered export workflows. |
| 074 | [CalSched](./calsched/) | `calsched` | `0.2.0` | `stable` | Linux, Windows, macOS | `/projects/software/calsched/` | CalSched is a calendar and scheduler with alert-capable PyQt5 desktop GUI and CLI modes, supporting recurring events, reminders, and persistent local storage. |
| 075 | [Cannadex](./cannadex/) | `cannadex` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/cannadex/` | Cannadex is a cannabis strain library viewer and marketplace data index with a Core variant that supports CLI, PyQt5 GUI, and headless modes for analytics and archival workflows. |
| 076 | [Cannapedia](./cannapedia/) | `cannapedia` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/cannapedia/` | Cannapedia is a wiki-like web platform for cannabis genetics, terpenes, cultivation notes, and verified lab results, designed for structured, community-extendable research and reference. |
| 077 | [Carter (CCTV Streaming System)](./carter/) | `carter` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/carter/` | Carter is a distributed CCTV streaming and video management system supporting real-time camera ingestion, recording, playback, and secure remote access. Designed for local-first deployments with optional cloud relay, analytics hooks, and AI-assisted monitoring. |
| 078 | [CasBra](./casbra/) | `casbra` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/casbra/` | CasBra (Casino Breaker) is a probabilistic inference engine for card, tabletop, and digital games. It analyzes hands, decks, and gameplay using statistical modeling, computer vision, and machine learning from image and video inputs to estimate opponent states and outcome probabilities. |
| 079 | [CDRC](./cdrc/) | `cdrc` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/cdrc/` | CDRC (Court DocRec Collector) is a bulk downloader and indexer for court documents that normalizes metadata, de-duplicates records, and builds searchable local corpora for legal research. |
| 080 | [CEES-Chirp](./cees-chirp/) | `cees-chirp` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, iOS | `/projects/software/cees-chirp/` | CEES-Chirp (Cricket Encrypted Encoding Specifications) is a biologically inspired, phase-shift-based, dual-channel secure data transmission protocol using 4096 unique cricket species chirp samples as high-entropy acoustic symbols for covert communication, cryptographic encoding, and air-gapped data transfer. |
| 081 | [ChappieVC (Voice Changer)](./chappievc/) | `chappievc` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/chappievc/` | ChappieVC is an AI-enhanced real-time vocal processing engine inspired by cinematic androids like Chappie, K-2SO, and C-3PO, using neural pitch-shifting, spectral morphing, glitch artifacts, and vocoder-based timbre modeling with PyQt5 GUI and CLI control for robot, mech, and droid voice presets. |
| 082 | [Character Generator](./character-generator/) | `character-generator` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/character-generator/` | Character Generator is a promptable character builder for games and fiction that outputs structured JSON bios, traits, and hooks suitable for integration with art pipelines, dialogue systems, and worldbuilding tools. |
| 083 | [Character RNG](./character-rng/) | `character-rng` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/character-rng/` | Character RNG is an advanced character generation and portrait system that combines structured generators with Stable Diffusion integration to produce consistent text bios and visual portraits from shared seeds and style-locks. |
| 084 | [CoreShim](./coreshim/) | `coreshim` | `0.2.0` | `alpha` | Linux, Windows, macOS | `/projects/software/coreshim/` | Bitcoin Core-compatible JSON-RPC, optional ZMQ and Core-framed block-file facade for btcd, intended to bridge software such as electrs and Fulcrum to a btcd backend without acting as a wallet or consensus implementation. |
| 085 | [CourtListener-AC](./courtlistener-ac/) | `courtlistener-ac` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/courtlistener-ac/` | CourtListener-AC (Audio Collector) fetches, catalogs, and tags CourtListener oral-argument audio along with transcripts, building searchable, timestamp-aligned local corpora for legal and linguistic research. |
| 086 | [Cryptainer](./cryptainer/) | `cryptainer` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/cryptainer/` | Cryptainer is a secure Bitcoin wallet/container storage system that ties GPG identities to encrypted vaults with timelocks, policy manifests, and auditable I/O flows for cold storage and operational custody. |
| 087 | [CyberChefAPK](./cyberchefapk/) | `cyberchefapk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/cyberchefapk/` | CyberChefAPK is an Android-native packaging of GCHQ’s CyberChef, providing a secure mobile interface for data transformation, encoding, decoding, cryptography, and forensic analysis. It preserves the original CyberChef codebase while wrapping it in a hardened Android WebView environment suitable for field use, research, and controlled laboratory workflows. |
| 088 | [CyberChefAPK-Offline](./cyberchefapk-offline/) | `cyberchefapk-offline` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/cyberchefapk-offline/` | CyberChefAPK-Offline is a fully airgapped Android build of CyberChef that bundles all required HTML, JavaScript, and assets directly inside the application. It operates without requesting network permissions and enforces strict origin controls, making it suitable for classified environments, field forensics, and offline research where network access is prohibited. |
| 089 | [CyberChefAPK-Online](./cyberchefapk-online/) | `cyberchefapk-online` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/cyberchefapk-online/` | CyberChefAPK-Online is an Android wrapper that connects securely to a remote CyberChef deployment. It enables always-up-to-date CyberChef usage while enforcing navigation restrictions and controlled origin loading. Designed for analysts who require live updates while maintaining a constrained mobile execution environment. |
| 090 | [CyberChefAPK-Server](./cyberchefapk-server/) | `cyberchefapk-server` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/cyberchefapk-server/` | CyberChefAPK-Server is an Android client designed to interface with a locally hosted CyberChef instance running on a workstation, lab server, or embedded device. It enables controlled LAN or localhost access to CyberChef through a hardened mobile interface, supporting portable forensic labs and hybrid offline–online workflows. |
| 091 | [CyberChefBash](./cyberchefkit/cyberchefbash/) | `cyberchefbash` | `0.1.0-alpha` | `alpha` | Linux, macOS, Kali | `/projects/software/cyberchefkit/cyberchefbash/` | Bash-based wrappers enabling CyberChef pipelines in Unix environments. |
| 092 | [CyberChefBAT](./cyberchefkit/cyberchefbat/) | `cyberchefbat` | `0.1.0-alpha` | `alpha` | Windows | `/projects/software/cyberchefkit/cyberchefbat/` | Windows Batch scripting layer for CyberChef transform automation. |
| 093 | [CyberChefC](./cyberchefkit/cyberchefc/) | `cyberchefc` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Embedded, Web companion | `/projects/software/cyberchefkit/cyberchefc/` | C implementation of CyberChef primitives optimized for embedded, airgapped, and low-level systems with minimal footprint and high auditability. |
| 094 | [CyberChefC#](./cyberchefkit/cyberchefcsharp/) | `cyberchefcsharp` | `0.1.0-alpha` | `alpha` | Windows, Linux, macOS, Web companion | `/projects/software/cyberchefkit/cyberchefcsharp/` | C#/.NET implementation of CyberChef transforms for enterprise and desktop environments. |
| 095 | [CyberChefC++](./cyberchefkit/cyberchefcpp/) | `cyberchefcpp` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web companion | `/projects/software/cyberchefkit/cyberchefcpp/` | High-performance C++ implementation of CyberChef primitives with CLI tools and library integration support. |
| 096 | [CyberChefCSS](./cyberchefkit/cyberchefcss/) | `cyberchefcss` | `0.1.0-alpha` | `alpha` | Web | `/projects/software/cyberchefkit/cyberchefcss/` | CSS theme and styling system for CyberChefKit interfaces. |
| 097 | [CyberChefCython](./cyberchefkit/cyberchefcy/) | `cyberchefcy` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web companion | `/projects/software/cyberchefkit/cyberchefcy/` | Cython-accelerated backend for high-performance CyberChef operations within Python ecosystems. |
| 098 | [CyberChefGo](./cyberchefkit/cyberchefgo/) | `cyberchefgo` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web companion | `/projects/software/cyberchefkit/cyberchefgo/` | Go-based CyberChef implementation for backend services and single-binary deployments. |
| 099 | [CyberChefHTML](./cyberchefkit/cyberchefhtml/) | `cyberchefhtml` | `0.1.0-alpha` | `alpha` | Web | `/projects/software/cyberchefkit/cyberchefhtml/` | Static HTML offline CyberChef interface requiring no runtime dependencies. |
| 100 | [CyberChefJava](./cyberchefkit/cyberchefjava/) | `cyberchefjava` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, Web companion | `/projects/software/cyberchefkit/cyberchefjava/` | Java/JVM CyberChef implementation for server and Android pipelines. |
| 101 | [CyberChefJS](./cyberchefkit/cyberchefjs/) | `cyberchefjs` | `0.1.0-alpha` | `alpha` | Web, Linux, Windows, macOS | `/projects/software/cyberchefkit/cyberchefjs/` | JavaScript/Node implementation supporting browser and backend transform pipelines. |
| 102 | [CyberChefKit](./cyberchefkit/) | `cyberchefkit` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS, Kali, Android, Embedded, Web | `/projects/software/cyberchefkit/` | CyberChefKit is a unified, multi-language, offline-first transformation and analysis suite implemented across Python, C, C++, C#, Go, Rust, Java, Kotlin, R, Perl, Ruby, Lua, PHP, JavaScript, TypeScript, HTML/CSS, Bash, Windows Batch, PowerShell, Swift, and MicroPython. It supports airgapped, embedded, desktop, mobile, and web workflows with optional local server components and modular CLI/GUI tooling. |
| 103 | [CyberChefKotlin](./cyberchefkit/cyberchefkt/) | `cyberchefkt` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, Web companion | `/projects/software/cyberchefkit/cyberchefkt/` | Kotlin-based CyberChef implementation for Android-native and JVM workflows. |
| 104 | [CyberChefLua](./cyberchefkit/cybercheflua/) | `cybercheflua` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/cyberchefkit/cybercheflua/` | Lua implementation for embedded scripting and OpenResty/Nginx integrations. |
| 105 | [CyberChefMicroPython](./cyberchefkit/cyberchefmpy/) | `cyberchefmpy` | `0.1.0-alpha` | `alpha` | ESP32, MicroPython, Embedded | `/projects/software/cyberchefkit/cyberchefmpy/` | MicroPython implementation of CyberChef primitives for ESP32 and embedded hardware environments. |
| 106 | [CyberChefPerl](./cyberchefkit/cyberchefperl/) | `cyberchefperl` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web companion | `/projects/software/cyberchefkit/cyberchefperl/` | Perl implementation of CyberChef primitives for legacy systems and Unix-based text processing pipelines. |
| 107 | [CyberChefPHP](./cyberchefkit/cyberchefphp/) | `cyberchefphp` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/cyberchefkit/cyberchefphp/` | PHP-based CyberChef implementation for web and LAMP stack environments. |
| 108 | [CyberChefPowerShell](./cyberchefkit/cyberchefps/) | `cyberchefps` | `0.1.0-alpha` | `alpha` | Windows, Linux, macOS | `/projects/software/cyberchefkit/cyberchefps/` | PowerShell implementation of CyberChef primitives for modern Windows administration and cross-platform pwsh automation, with pipeline-safe transforms, module packaging, and constrained command-line workflows. |
| 109 | [CyberChefPy](./cyberchefkit/cyberchefpy/) | `cyberchefpy` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web companion | `/projects/software/cyberchefkit/cyberchefpy/` | Python module and CLI providing CyberChef-style transforms for scripting, automation, and notebooks. |
| 110 | [CyberChefR](./cyberchefkit/cyberchefr/) | `cyberchefr` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web companion | `/projects/software/cyberchefkit/cyberchefr/` | R bindings for CyberChef-style transforms optimized for data processing and forensic preprocessing workflows. |
| 111 | [CyberChefRuby](./cyberchefkit/cyberchefrb/) | `cyberchefruby` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/cyberchefkit/cyberchefrb/` | Ruby implementation of CyberChef primitives for scripting and Rails-based tooling. |
| 112 | [CyberChefRust](./cyberchefkit/cyberchefrs/) | `cyberchefrust` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, WebAssembly, Web companion | `/projects/software/cyberchefkit/cyberchefrs/` | Rust-based CyberChef primitives with WASM support for safe, high-performance execution. |
| 113 | [CyberChefSwift](./cyberchefkit/cyberchefswift/) | `cyberchefswift` | `0.1.0-alpha` | `alpha` | macOS, iOS | `/projects/software/cyberchefkit/cyberchefswift/` | Swift implementation of CyberChef primitives for macOS and iOS ecosystems using Foundation, CryptoKit, and Swift Package Manager for native transformation pipelines. |
| 114 | [CyberChefTypeScript](./cyberchefkit/cyberchefts/) | `cyberchefts` | `0.1.0-alpha` | `alpha` | Web, Linux, Windows, macOS | `/projects/software/cyberchefkit/cyberchefts/` | TypeScript implementation of CyberChef primitives for strongly typed browser and Node.js pipelines, with ESM APIs, declaration output, npm packaging, and deterministic transform tooling. |
| 115 | [CyberConcubine](./cyberconcubine/) | `cyberconcubine` | `0.1.0-alpha` | `alpha` | Web | `/projects/software/cyberconcubine/` | Privacy-first adult partnership coordination platform for consensual relationship planning, fairness tracking, dates and trips, scenes and sessions, cycle and astrology context, boundaries, agreements, and encrypted local project export. |
| 116 | [CyberGeisha-AI (Adult-NSFW)](./cgai/) | `cgai` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/cgai/` | Generative AI engine for text, image, GIF, video, audio, TTS, and STT synthesis. Functions as an adaptive adult-oriented AI personal assistant with emotional modeling, artistic co-creation, and multimodal conversational intelligence. |
| 117 | [Dab Timer](./dabtimer/) | `dabtimer` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/dabtimer/` | Precision quartz-cycle timer for concentrate vaporization with configurable cooldown profiles, LED cue patterns, and thermal calibration presets for repeatable dab temperatures. |
| 118 | [Dab Timer (APK)](./dabtimer-apk/) | `dabtimer-apk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/dabtimer-apk/` | Android APK port of Dab Timer — precision quartz-cycle timer for concentrate vaporization with configurable cooldown profiles, visual cue patterns, and thermal calibration presets for repeatable dab temperatures. |
| 119 | [DataScope](./scopez/datascope/) | `datascope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/datascope/` | General-purpose data ingestion, normalization, and transformation system for structured and unstructured datasets. |
| 120 | [DaVinci](./davinci/) | `davinci` | `1.0.1` | `alpha` | Linux, Windows, macOS | `/projects/software/davinci/` | Local image-generation studio with PyQt5 GUI/CLI for Stable Diffusion text-to-image, image-to-image, inpainting, batch references, reproducible prompt/style workflows, and CUDA-accelerated local generation. |
| 121 | [deadbeefid](./deadbeefid/) | `deadbeefid` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/deadbeefid/` | Experimental cryptographic developer identity and provenance system for deterministic hash-based identifiers and identity-signing artifacts used to bind ZZX-Labs work to an accountable developer identity. |
| 122 | [Delta Dharma Theory](./ddt/) | `ddt` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/ddt/` | Delta Dharma Theory is a theoretical model of the mass of past souls across past lives reincarnate. |
| 123 | [DeviceScope](./scopez/devicescope/) | `devicescope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/devicescope/` | Device fingerprinting system combining MAC, IMEI, OS signatures, and behavioral traits for hardware-level attribution. |
| 124 | [Dhama](./dhama/) | `dhama` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/dhama/` | Dhama is a meditation and mindfulness application that blends soundscapes, mantras, and synchronized visuals in a minimalist PyQt5 UX for focused contemplative sessions. |
| 125 | [Dharma Lab](./dharma-lab/) | `dharma-lab` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/dharma-lab/` | Dharma Lab is a computational research environment for contemplative timing, breath, and attention, bundling experimental protocols, analytics, and simulation instruments. |
| 126 | [Dicelocks](./dicelocks/) | `dicelocks` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/dicelocks/` | Multilingual Diceware and mnemonic-generation environment with editioned reusable word-list volumes, GUI/CLI tooling, CSPRNG/rejection-sampling generation, and no-repeat controls. |
| 127 | [Discord Downgrader](./discord-downgrader/) | `discord-downgrader` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/discord-downgrader/` | Discord Downgrader is a Python + FFmpeg utility that iteratively shrinks audio files under 10 MB for Discord uploads while preserving as much perceptual quality as possible. |
| 128 | [DomainScope](./scopez/domainscope/) | `domainscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/domainscope/` | Domain and DNS analysis system mapping ownership, hosting infrastructure, and historical records for attribution and network intelligence. |
| 129 | [EmailScope](./scopez/emailscope/) | `emailscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/emailscope/` | Analytical system for modeling email address space, aliasing behavior, provider distributions, and probabilistic identity inference. |
| 130 | [EMIGNA Encryption System](./emigna/) | `emigna` | `0.1.0-alpha` | `alpha` | Linux, Windows | `/projects/software/emigna/` | Programmable rotor-based encryption system inspired by Enigma, extended with SHA3-256 entropy layers, GPU acceleration, and modular rotor definitions. |
| 131 | [Expanded Diceware Volumes](./expanded-diceware-volumes/) | `expanded-diceware-volumes` | `0.1.0-alpha` | `alpha` | Any | `/projects/software/expanded-diceware-volumes/` | Expanded Diceware Volumes provide themed and locale-aware wordlists plus methodologies for building stronger, high-entropy Diceware passphrases and mnemonic systems. |
| 132 | [EyeBreaker](./eyebreaker/) | `eyebreaker` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/eyebreaker/` | Screen-time and eye-strain interruption system designed to enforce breaks, log compliance, and quantify fatigue patterns over time in a privacy-first offline workflow. |
| 133 | [EyeBreaker (APK)](./eyebreaker-apk/) | `eyebreaker-apk` | `1.0.0` | `stable` | Android | `/projects/software/eyebreaker-apk/` | Native Android APK companion for EyeBreaker with offline-first break enforcement and exportable logs for controlled synchronization. |
| 134 | [FAR (Firefox Audio Router) Add-on](./far/) | `far` | `0.1.0-alpha` | `alpha` | Firefox, Windows, Linux, macOS | `/projects/software/far/` | Firefox Audio Router (FAR) — browser extension enabling per-tab audio routing, device selection, input/output control, and gain staging directly within Firefox. Allows users to route specific tabs to selected sound devices (e.g., headphones, virtual cables, speakers) and integrates with OS mixers and virtual audio drivers. Designed for creators, streamers, and musicians managing multiple active sessions concurrently. |
| 135 | [FARTINAJAR](./fartinajar/) | `fartinajar` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/fartinajar/` | Authenticity and change-tracking manifest system using deterministic project-tree SHA3-256 hashing, Bitcoin block-height anchoring, GPG identity/signatures, possession proofs, and optional hardware-backed signatures for release provenance. |
| 136 | [FieldRecorder](./fieldrecorder/) | `fieldrecorder` | `0.8.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/fieldrecorder/` | Secure audio field recording system for desktop and server environments with offline-first storage, optional encrypted export, and controlled backup workflows. |
| 137 | [FieldRecorder (APK)](./fieldrecorder-apk/) | `fieldrecorder-apk` | `0.8.0-alpha` | `alpha` | Android | `/projects/software/fieldrecorder-apk/` | Native Android APK secure audio field recorder with offline-first storage and optional encrypted cloud backup pathways under explicit user control. |
| 138 | [Firefox Tycho](./tycho/) | `tycho` | `0.1.1` | `alpha` | Linux, Windows, macOS | `/projects/software/tycho/` | Local-first Firefox media control surface and companion tooling with native HTML media volume/mute control, A/B decks, crossfader, spectrum/BPM/key analysis, playback history, smart playlists, and root Python GUI/CLI launchers. |
| 139 | [FiveTrace](./fivetrace/) | `fivetrace` | `0.2.0` | `superseded` | Linux, Windows, macOS | `/projects/software/fivetrace/` | Earlier passive OSINT case-analysis lineage that preceded Tracy/Project Mongoose; retained for compatibility, migration testing and provenance rather than new feature development. |
| 140 | [flyr](./flyr/) | `flyr` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/flyr/` | Generative design and layout engine for flyers, posters, and branding assets. Uses geometric mathematics, fractal symmetry, and tessellation algorithms to produce visually striking compositions for print or digital media. |
| 141 | [Fortune Cookie Phase Cipher (FCPC)](./fcpc/) | `fcpc` | `0.1.0-alpha` | `alpha` | Linux, Windows | `/projects/software/fcpc/` | Layered encryption system that obscures plaintext using phase-shifted encoding, null/salt injection, and GPG-wrapped payload structures for high-entropy obfuscation. |
| 142 | [FreedomGewse](./freedomgewse/) | `freedomgewse` | `0.3.2-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/freedomgewse/` | FreedomGewse is the Canada FreedomX family root for Bitcoin-only, noncustodial CEX and DEX reference implementations using BTC/CAD research models and client-owned signing. |
| 143 | [FreedomGewseCEX](./freedomgewse/freedomgewsecex/) | `freedomgewsecex` | `0.3.2-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/freedomgewse/freedomgewsecex/` | FreedomGewseCEX is the Canada CEX member of FreedomX: a Bitcoin-only, noncustodial exchange reference implementation with centralized price-time matching, client-owned signing, multi-party operator controls, and national meme branding. |
| 144 | [FreedomGewseDEX](./freedomgewse/freedomgewsedex/) | `freedomgewsedex` | `0.3.2-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/freedomgewse/freedomgewsedex/` | FreedomGewseDEX is the Canada DEX member of FreedomX: a Bitcoin-only, noncustodial exchange reference implementation with peer-offer relays and route construction, client-owned signing, multi-party operator controls, and national meme branding. |
| 145 | [FreedomKobra](./freedomkobra/) | `freedomkobra` | `0.3.2-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/freedomkobra/` | FreedomKobra is the United States FreedomX family root for Bitcoin-only, noncustodial CEX and DEX reference implementations using BTC/USD research models and client-owned signing. |
| 146 | [FreedomKobraCEX](./freedomkobra/freedomkobracex/) | `freedomkobracex` | `0.3.2-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/freedomkobra/freedomkobracex/` | FreedomKobraCEX is the United States CEX member of FreedomX: a Bitcoin-only, noncustodial exchange reference implementation with centralized price-time matching, client-owned signing, multi-party operator controls, and national meme branding. |
| 147 | [FreedomKobraDEX](./freedomkobra/freedomkobradex/) | `freedomkobradex` | `0.3.2-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/freedomkobra/freedomkobradex/` | FreedomKobraDEX is the United States DEX member of FreedomX: a Bitcoin-only, noncustodial exchange reference implementation with peer-offer relays and route construction, client-owned signing, multi-party operator controls, and national meme branding. |
| 148 | [FreedomX](./freedomx/) | `freedomx` | `0.3.2-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/freedomx/` | FreedomX is the canonical exchange-family root replacing the older FreedomEx identity and organizing the FreedomGewse and FreedomKobra families, each with their own CEX and DEX implementations. |
| 149 | [FullNode-Scraper](./fullnode-scraper/) | `fullnode-scraper` | `0.1.0-alpha` | `alpha` | Linux, macOS, Kali | `/projects/software/fullnode-scraper/` | FullNode-Scraper is a Bash/Python toolset that scans and geolocates public Bitcoin nodes, producing 6-hour JSON snapshots with Tor/clearnet splits and network metadata. |
| 150 | [Gameo](./gameo/) | `gameo` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/gameo/` | Pixel-based artificial-life simulation with biomes, food webs, chemistry, pheromones, behavior, environmental systems, timelines, APIs, and interactive visualization. |
| 151 | [GardenHarvester](./gardenharvester/) | `gardenharvester` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/gardenharvester/` | GardenHarvester is a radio stream ripper that monitors metadata changes and splits continuous audio into tagged MP3 tracks, ideal for archiving internet radio and longform streams. |
| 152 | [GeishaGallery-AI (Adult-NSFW)](./ggai/) | `ggai` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/ggai/` | AI-driven adult art and media gallery system featuring curated generative works by verified users. Integrates identity verification, encrypted asset provenance, and adaptive AI moderation pipelines. |
| 153 | [Geisha’s BlackBook](./gbb/) | `gbb` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/gbb/` | Private cataloging and record-management app for professional creators and studios. Handles metadata, credits, media archives, and session logs for adult art, modeling, and BDSM-related productions. |
| 154 | [GeoAdd](./geoadd/) | `geoadd` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/geoadd/` | GeoAdd is a geo-addressing system providing reversible shortcodes with increasing precision, supporting OSM overlays and spatial APIs for Python-based geospatial workflows. |
| 155 | [GeoScope](./scopez/geoscope/) | `geoscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/geoscope/` | Geospatial analysis system mapping coordinates, geohashes, and location identifiers into probabilistic geographic attribution models. |
| 156 | [GKSs (Glyph Key Sprites)](./gks/) | `gks` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/gks/` | GKSs are animated digital sentinels bound to Bitcoin and cryptainer keys. Each sprite represents an encrypted container’s guardian entity—generated through random dice-based entropy and procedural pixel art. Traits, rarity, and behavior correspond to wallet tiers, enabling visual cryptography and gamified key management. |
| 157 | [gNee (Global / General Network Environment Engine)](./gnee/) | `gnee` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/gnee/` | gNee (Global / General Network Environment Engine) is a unified GUI and CLI orchestration layer providing a single control surface for multi-site, multi-service infrastructure stacks including web, mail, SFTP, APIs, media streams, GPG keyservers, Bitcoin fullnodes, and Lightning nodes. |
| 158 | [Gomle](./gomle/) | `gomle` | `0.2.0` | `stable` | Linux, Windows, macOS | `/projects/software/gomle/` | Gomle is a single-site isolated media browser built in PyQt5 (QtWebEngine) designed for focused, ad-free playback and research with embedded audio/video routing controls and sandboxed sessions. |
| 159 | [GP-AI](./gpai/) | `gpai` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/gpai/` | GP-AI is the SFW suite and platform of GP tools, datasets, and models for text, visual, and audio generation, integrating open datasets and modular fine-tuning pipelines for creative and research use. |
| 160 | [GP-Gallery-AI](./gpgai/) | `gpgai` | `0.2.0-alpha` | `alpha` | Web, Linux, Windows, macOS | `/projects/software/gpgai/` | GP-Gallery-AI is a safe-for-work gallery platform for GP assistants that curates and streams user-generated creations across text, art, and audio formats with shareable, verified metadata feeds. |
| 161 | [GP: (GPT PDA)](./gp/) | `gp` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS, Android, iOS | `/projects/software/gp/` | GP: Generative Pre-trained Transformer Personal Digital Assistant suite with SFW and NSFW variants supporting text, image, GIF, video, audio, TTS, and STT capabilities with adaptive emotional modeling and plugin extensions. |
| 162 | [Greywave](./greywave/) | `greywave` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/greywave/` | High-resolution visualizer and generative-control family using Python/PyQt5, Pillow/NumPy and optional TensorFlow/CUDA paths, with parameter mapping, presets, media export, and external-control adapters. |
| 163 | [GridHub](./gridhub/) | `gridhub` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/gridhub/` | GridHub is a dynamic Python GUI that displays multiple live web thumbnails in a customizable grid with zoom, fullscreen, and dashboard presets for live-monitoring workflows. |
| 164 | [GSKs (Glyph Sprite Keys)](./gsk/) | `gsk` | `0.1.0-spec` | `prototype` | Linux, Windows, macOS | `/projects/software/gsk/` | GSK defines a custom cryptographic key format derived from SHA3-256 and RIPEMD160 with a lowercase Base32 encoding, excluding ambiguous glyphs. Each key includes an extended checksum and prefix structure for unique, human-readable, and error-resistant identifiers used across ZZX-Labs encryption systems. |
| 165 | [GutorCal](./gutorcal/) | `gutorcal` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/gutorcal/` | Name-confirmed in-development ZZX-Labs project retained in the canonical roster. Detailed scope, stack, version, and per-project route metadata are pending reconciliation from the project repository/manifests. |
| 166 | [GWALR (Global War Art Loss Registry)](./gwalr/) | `gwalr` | `0.1.0-alpha` | `alpha` | Web, Linux, Windows | `/projects/software/gwalr/` | A distributed registry platform documenting destruction, theft, and damage of cultural artifacts during armed conflicts. Enables submission, verification, and archival of lost artworks across global war zones. |
| 167 | [GWEN](./gwen/) | `gwen` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/gwen/` | Modular entity-analysis and public-record research system for geospatial investigations, knowledge management, risk assessment, entity graphs, and reproducible analyst workflows. |
| 168 | [Hasher](./hasher/) | `hasher` | `0.2.0` | `stable` | Linux, Windows, macOS | `/projects/software/hasher/` | Hasher is a Python-based recursive file lister and hasher with rolling catalogs, forensic-friendly exports, and metadata integrity checks for archival validation. |
| 169 | [HashPig](./hashpig/) | `hashpig` | `0.1.0` | `stable` | Linux, macOS, Kali | `/projects/software/hashpig/` | HashPig is a two-part CLI toolkit (Bash & Python) that attributes Bitcoin mining hashrate by nation via public node IPs and statistical node clustering. |
| 170 | [Huah](./huah/) | `huah` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, Termux | `/projects/software/huah/` | Huah is a lawful aggregation and analysis system that consolidates publicly available wanted notices, bulletins, and suspect data from domestic and international law enforcement and partner agencies into a unified, searchable, and printable per-suspect intelligence view. |
| 171 | [HydraMe](./hydrame/) | `hydrame` | `0.1.0-alpha` | `alpha` | Windows, Linux, macOS | `/projects/software/hydrame/` | HydraMe is a hydration discipline tracker built around simple 1L (Nalgene) units, reminders, and trend dashboards to normalize proper hydration. |
| 172 | [HydraMeAPK](./hydrameapk/) | `hydrameapk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/hydrameapk/` | HydraMeAPK is the mobile hydration companion with rapid logging, reminders, and offline secure sync with desktop basestation. |
| 173 | [I-Ching](./iching/) | `iching` | `0.1.0` | `stable` | Linux, Windows, macOS | `/projects/software/iching/` | I-Ching is a Bitcoin missed-opportunity calculator visualizing price loss over time to quantify purchasing-power drift for holders and traders. |
| 174 | [IdentityScope](./scopez/identityscope/) | `identityscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/identityscope/` | Unified identity inference engine correlating multi-domain datasets including email, IP, telecom, and blockchain to construct probabilistic identity graphs. |
| 175 | [ImaGhee](./imaghee/) | `imaghee` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/imaghee/` | ImaGhee is an image converter and rescaler GUI with batch presets, EXIF handling, and lossless and lossy compression modes, supporting PNG, JPEG, WebP, and TIFF conversions. |
| 176 | [IPScope](./scopez/ipscope/) | `ipscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/ipscope/` | System for analyzing IPv4 and IPv6 address space, ASN ownership, routing behavior, and probabilistic attribution across ISPs, VPNs, Tor, and proxy networks. |
| 177 | [ISAN](./isn/isan/) | `isan` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/isn/isan/` | ISAN is a decentralized P2P audio streaming and relay network — resilient, signed, and self-hostable; designed for autonomous broadcast, long-term uptime, and archival-grade performance. |
| 178 | [ISN](./isn/) | `isn` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS, Android, Raspberry Pi | `/projects/software/isn/` | ISN is a decentralized P2P media streaming platform and relay network — resilient, signed, and self-hostable; designed for autonomous broadcast and archival-grade uptime across ISAN, ISRN, ISVN, and ISTV. |
| 179 | [ISRN](./isn/isrn/) | `isrn` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/isn/isrn/` | ISRN is a decentralized P2P radio streaming platform and relay network — resilient, signed, and self-hostable; designed for 24/7 internet radio with metadata-synced playlists and station management. |
| 180 | [ISTV](./isn/istv/) | `istv` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS, Android, Raspberry Pi | `/projects/software/isn/istv/` | ISTV is a decentralized P2P television broadcasting platform and relay streaming network — resilient, signed, and self-hostable; enabling creation of full-time internet TV stations via M3U playlists and automated channel scheduling. |
| 181 | [ISVN](./isn/isvn/) | `isvn` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS, Android, Raspberry Pi | `/projects/software/isn/isvn/` | ISVN is a decentralized P2P video streaming platform and relay network — resilient, signed, and self-hostable; supporting 24/7 live channels, playlists, and scheduled programming for independent broadcasters. |
| 182 | [Kermit’s Trident](./kermits-trident/) | `kermits-trident` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/kermits-trident/` | Kermit’s Trident is a cyber-tradecraft training, schooling, and discipline system offering curricula, drills, simulated red-team/blue-team exercises, and certification pathways to produce field-ready analysts and operators. |
| 183 | [KeyKey](./keykey/) | `keykey` | `0.1.0` | `stable` | Linux, Windows, macOS | `/projects/software/keykey/` | KeyKey generates random seeds, hashes them via SHA3-256, and encodes into Base64 and Base58 (RIPEMD-160) formats using CyberChef. It outputs derived cryptographic keys with optional encryption and metadata tagging. |
| 184 | [Kinkiju](./kinkiju/) | `kinkiju` | `0.1.0-alpha` | `alpha` | Web, Linux, Windows | `/projects/software/kinkiju/` | Kinkiju is an adult-oriented social and gamified interaction platform focused on kink, BDSM, and fetish communities with matchmaking, roleplay systems, and interactive environments. |
| 185 | [Kinkiju (APK)](./kinkiju-apk/) | `kinkiju-apk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/kinkiju-apk/` | Mobile Android application for Kinkiju providing location-aware matchmaking, messaging, and gamified interaction systems with offline-first capabilities. |
| 186 | [kinkr](./kinkr/) | `kinkr` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, iOS | `/projects/software/kinkr/` | Encrypted fetish, BDSM, and kink compatibility system for ethical, harm-reduction-based dating and community networking. Scores shared interests and limits across text, image, and media data to match partners safely and intelligently across decentralized networks. |
| 187 | [KYKY](./kyky/) | `kyky` | `0.9.1` | `superseded` | Linux, Windows, macOS | `/projects/software/kyky/` | Earlier conflict-accountability OSINT research system for evidence-preserving historical reconstruction, identity/case research, provenance tracking, multilingual source handling, and reproducible research snapshots. Retained as lineage and superseded by PRYATKI. |
| 188 | [Lexiphor](./lexiphor/) | `lexiphor` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/lexiphor/` | Lexiphor is a PyQt5-based code formatter for C, C++, JS, Python, HTML, CSS, JSON, Go, Perl, Lua, R, Ruby, Rust, and Java, offering unified style presets and instant preview of reformatted source output. |
| 189 | [LightningLotto](./lightninglotto/) | `lightninglotto` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/lightninglotto/` | LightningLotto is a high-frequency, sats-denominated Bitcoin lottery engine operating on fixed UTC time slots. It extends the BitLotto deterministic drawing model with rapid cadence rounds, Lightning-friendly payout logic, and reproducible fairness proofs anchored to Bitcoin block data. Designed for transparency, verifiability, and server-side orchestration, LightningLotto supports GUI, CLI, and API-driven workflows. |
| 190 | [LinkScope](./scopez/linkscope/) | `linkscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/linkscope/` | Graph-based relationship mapping engine for linking entities across datasets into structured intelligence graphs. |
| 191 | [LuminaObscura](./luminaobscura/) | `luminaobscura` | `0.1.0` | `alpha` | Linux, Windows, macOS | `/projects/software/luminaobscura/` | Celestial-image diversification and seed-material research generator combining public Moon/Sun imagery with trusted host CSPRNG entropy, nested image crops, cryptographic extraction and Base32-linked output chains. |
| 192 | [LunaPy](./lunapy/) | `lunapy` | `2.0.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/lunapy/` | Local entropy-to-ideogram engine that converts physical coin or dice entropy into unbiased bitstreams and scannable Luna ideogram chains with deterministic encoding, PNG/JSON export and verification. |
| 193 | [LunaPyCam](./lunapycam/) | `lunapycam` | `2.0.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/lunapycam/` | Camera and image recognition companion for LunaPy that detects, rectifies, decodes and validates printed/scanned Luna ideogram chains. |
| 194 | [Lunar Clock](./lunar-clock/) | `lunar-clock` | `0.1.0` | `stable` | Linux, Windows, macOS | `/projects/software/lunar-clock/` | Lunar Clock is a high-precision lunar phase and age clock that tracks eclipses, standstills, nodal cycles, and synodic timing for astronomical and ritual synchronization. |
| 195 | [MACScope](./scopez/macscope/) | `macscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/macscope/` | Hardware address analysis engine mapping MAC address space to manufacturers, device classes, and network behaviors for attribution and device fingerprinting. |
| 196 | [Magneta](./magneta/) | `magneta` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/magneta/` | Magneta is an all-in-one secure data sanitization tool implementing ATA/NVMe secure erase and multi-pass crypto overwrites with verifiable reports for forensic-grade data destruction. |
| 197 | [MalIPLib](./maliplib/) | `maliplib` | `0.2.0` | `stable` | Linux, Windows, macOS, Kali | `/projects/software/maliplib/` | MalIPLib is a malicious IP intelligence and enrichment library offering ASN, geo, and WHOIS tagging with scoring models for security analytics and network forensics. |
| 198 | [ManchurianTiger](./t4np/manchuriantiger/) | `manchuriantiger` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/t4np/manchuriantiger/` | ManchurianTiger is the DPRK-focused T4NP module, introducing native-illegal indexing and codepath obfuscation rules that deter analysis, compilation, and compliant reuse of protected code in North Korean contexts. |
| 199 | [MantraBox](./mantrabox/) | `mantrabox` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/mantrabox/` | MantraBox is a TTS mantra synthesizer and looper that supports tempo control, layering, and session exports with visual feedback and soundscape synchronization for meditation and ritual use. |
| 200 | [MarkhorSheep](./t4np/markhorsheep/) | `markhorsheep` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/t4np/markhorsheep/` | MarkhorSheep is the Pakistan-focused T4NP jurisdiction profile for defensive source-distribution controls, provenance enforcement, release gating, and build-policy checks in Pakistani deployment contexts. |
| 201 | [MarVIS](./marvis/) | `marvis` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/marvis/` | Marine Video Identification System (MarVIS) uses TensorFlow-based vision and audio models to identify marine life in low-light and high-turbidity conditions, providing robust tagging, recognition, and dataset curation pipelines. |
| 202 | [MarVIS-RNGvG](./marvis-rngvg/) | `marvis-rngvg` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/marvis-rngvg/` | MarVIS-RNGvG (Randomized Next-Gen Video Generator) produces synthetic marine video datasets through augmentation, noise modeling, and procedural clip generation for AI training and validation. |
| 203 | [md2pdf](./md2pdf/) | `md2pdf` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/md2pdf/` | Markdown-to-PDF conversion utility using Python Markdown/PDF tooling and wkhtmltopdf-based rendering for reproducible local document export. |
| 204 | [memeantix](./memeantix/) | `memeantix` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/memeantix/` | memeantix is a campaign-capable meme engine supporting template packs, A/B variants, scheduling, telemetry, and multi-platform asset deployment for coordinated meme operations. |
| 205 | [memeantix — CWG](./memeantix/cwg/) | `memeantix-cwg` | `0.1.0` | `stable` | Any | `/projects/software/memeantix/cwg/` | memeantix — CWG (Chimps with Guns) is a themed campaign module containing art packs, meme prompts, and distribution tooling for memeantix’s campaign engine. |
| 206 | [memeantix — FSO](./memeantix/fso/) | `memeantix-fso` | `0.1.0` | `stable` | Any | `/projects/software/memeantix/fso/` | memeantix — FSO is a specialized campaign asset pack providing automation presets, scripting utilities, and distribution-ready meme templates for rapid deployment. |
| 207 | [memeantix — PEG](./memeantix/peg/) | `memeantix-peg` | `0.1.0` | `stable` | Any | `/projects/software/memeantix/peg/` | memeantix — PEG (Platypus Egg Gourmettes) is a campaign module featuring narrative kits, thematic art packs, and visual styles integrated into memeantix workflows. |
| 208 | [memeantix — SDO](./memeantix/sdo/) | `memeantix-sdo` | `0.1.0` | `stable` | Any | `/projects/software/memeantix/sdo/` | memeantix — SDO (Scenario Deployment Operations) is a scheduling and release-control module that automates meme distribution sequences and controlled campaign timing. |
| 209 | [MempoolSpecs](./mempoolspecs/) | `mempoolspecs` | `0.3.0-alpha` | `alpha` | Web, Linux, Windows, macOS | `/projects/software/mempoolspecs/` | MempoolSpecs is a visualization engine modeled after mempool.space, providing real-time Bitcoin mempool goggles with fee tiers, transaction age, and propagation heatmaps. |
| 210 | [Merlin](./merlin/) | `merlin` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/merlin/` | Offline/local AI assistant project with retrieval-augmented indexing and user-controlled corpus search workflows. |
| 211 | [MetaTagDB](./metatagdb/) | `metatagdb` | `0.4.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/metatagdb/` | MetaTagDB is an open metadata framework for auto-tagging, categorizing, fingerprinting, and analyzing video libraries. It’s local-first, extensible with AI modules, and supports deep metadata synchronization. |
| 212 | [Mnemonic Generator](./mnemonic-generator/) | `mnemonic-generator` | `0.1.0` | `stable` | Linux, Windows, macOS | `/projects/software/mnemonic-generator/` | Mnemonic Generator creates 12-, 16-, 24-, or 32-word seed phrases and short passphrases with entropy validation and printable card exports for secure cold storage. |
| 213 | [MozLib (Mozart Library)](./mozlib/) | `mozlib` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/mozlib/` | Mozart-inspired audio library for local playback, playlist management, tagging, and visualized waveforms. Designed for focused listening sessions, archival organization, and analytic views of audio collections. |
| 214 | [mu3u](./mu3u/) | `mu3u` | `0.1.0` | `stable` | Linux, Windows, macOS | `/projects/software/mu3u/` | mu3u is an M3U playlist builder, editor, and viewer library with tag validation, stream testing, and embedded metadata inspection for audio and video playlists. |
| 215 | [NameProbe](./nameprobe/) | `nameprobe` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/nameprobe/` | Name probability analysis engine calculating frequency, distribution, and likelihood of names across geography, demographics, and historical datasets. |
| 216 | [NaturaVA](./naturava/) | `naturava` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/naturava/` | NaturaVA (Natura Video Archiver) is a large-scale video ingestion and management tool that performs de-duplication, tagging, and search across nature and wildlife archives. |
| 217 | [NetScope](./scopez/netscope/) | `netscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/netscope/` | Network topology and traffic analysis system modeling routing paths, packet flows, and infrastructure relationships. |
| 218 | [Neville](./neville/) | `neville` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/neville/` | Cannabis genetics and botanical research platform for breeding, lineage, phenotype, cultivation, Punnett-square analysis, and preservation records. |
| 219 | [nginxAPK](./nginxapk/) | `nginxapk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/nginxapk/` | nginxAPK packages nginx into a hardened Android application that can run a local web server on-device for offline sites, lab dashboards, and portable field tooling. It supports serving static content, reverse proxying to localhost services, and running constrained, profile-based configs with explicit port binding and storage-mapped document roots for repeatable deployments. |
| 220 | [NodePIX](./nodepix/) | `nodepix` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/nodepix/` | Bitcoin-node peer-health analysis and visualization project that evaluates node/peer observations and assigns a PIX-style health rating for inspection and comparison. |
| 221 | [NPDquery](./npdquery/) | `npdquery` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/npdquery/` | Streaming regex search and partitioning system for very large text datasets, organized into state, country, and unmatched subvolumes for repeatable local analysis. |
| 222 | [NubianIbex](./t4np/nubianibex/) | `nubianibex` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/t4np/nubianibex/` | NubianIbex is the Israel-focused T4NP jurisdiction profile for defensive source-distribution controls, provenance enforcement, release gating, and build-policy checks in Israeli deployment contexts. |
| 223 | [NutraMe](./nutrame/) | `nutrame` | `0.1.0-alpha` | `alpha` | Windows, Linux, macOS | `/projects/software/nutrame/` | NutraMe is an offline-first nutrition intake ledger for calories, macros, sugars, supplements, and label-photo assisted logging with privacy-first analytics and exports. |
| 224 | [NutraMeAPK](./nutrameapk/) | `nutrameapk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/nutrameapk/` | NutraMeAPK is the mobile nutrition companion for quick meal logging, label-photo capture, and offline secure sync with the desktop basestation. |
| 225 | [OB1WAN](./ob1wan/) | `ob1wan` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/ob1wan/` | Local artifact-analysis and BIP39/steganography research workbench for explicitly owned or authorized puzzle/recovery artifacts, with non-destructive extraction, candidate indexing, resumable permutation analysis and GUI/CLI workflows. |
| 226 | [OpenTerra Workstation](./openterra-workstation/) | `openterra-workstation` | `1.0.0` | `superseded` | Linux, Windows, macOS | `/projects/software/openterra-workstation/` | Earlier public identity of the local-first mapping/logistics workstation now carried forward by Тактична Мапа; retained as a compatibility and migration alias. |
| 227 | [OSCI](./osci/) | `osci` | `0.3.1` | `alpha` | Linux, Windows, macOS | `/projects/software/osci/` | Python oscilloscope and signal-analysis workstation with PyQt5/OpenGL GUI and CLI, FFT/spectrogram/triggering/power analysis, audio and IQ sources, SDR adapters, recording/export, and optional TensorFlow/CUDA analysis paths. |
| 228 | [otto](./otto/) | `otto` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/otto/` | otto (Operator Tools & Task Orchestrator) is a high-automation video ripper and downloader system for capturing online streams, managing task queues, and integrating with local archival storage workflows. |
| 229 | [OwnMap](./ownmap/) | `ownmap` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/ownmap/` | OwnMap is a decentralized geospatial intelligence and property operations platform integrating mapping, CRM, legal workflows, escrow systems, and field data collection with offline-first capabilities. |
| 230 | [OwnMap (APK)](./ownmap-apk/) | `ownmap-apk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/ownmap-apk/` | Android field agent application for OwnMap with GPS tracking, offline map caching, media capture, and secure synchronization. |
| 231 | [Parallel Explorer](./parallel-explorer/) | `parallel-explorer` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/parallel-explorer/` | Parallel Explorer is a high-performance AI-assisted file forensics and search engine that performs parallel directory scans, schema-aware metadata extraction, and contextual query matching across large datasets. |
| 232 | [Pay-to-Toll Protocol (PtTP)](./pttp/) | `pttp` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/pttp/` | Pay-to-Toll Protocol (PtTP) defines Bitcoin-native tolling primitives for metered digital services, API calls, or time-bound access control using P2T contracts and dynamic rate scheduling. |
| 233 | [PersianLeopard](./t4np/persianleopard/) | `persianleopard` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/t4np/persianleopard/` | PersianLeopard is the Iran-focused T4NP module, adding jurisdiction-specific encodings, lexical fences, and build-chain tripwires to prevent compliant reuse and automated refactoring of protected code in IRN. |
| 234 | [PhaseCipherEncoding (PCE) Systems](./pce/) | `pce` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, iOS | `/projects/software/pce/` | PhaseCipherEncoding (PCE) — advanced cryptographic encoding framework using phase-shift, frequency, and waveform interference patterns to represent encrypted data. Combines phase modulation with spectral nulls, salting, and pebbling effects for quantum-resistant ciphertext generation. Supports Base128/256 and Unicode null-symbol injection to obfuscate entropy layers and encode multi-dimensional cryptographic sequences. |
| 235 | [PictoCrypt](./pictocrypt/) | `pictocrypt` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/pictocrypt/` | Pictogram-based encoding/cryptography research system built around a large audited Unicode symbol inventory, normalization/confusable/renderability checks, stable symbol IDs, keyed mappings, checksums, and GUI/CLI tooling. |
| 236 | [PixelPixie](./pixelpixie/) | `pixelpixie` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/pixelpixie/` | Name-confirmed in-development ZZX-Labs visual/provenance project identity. Retained separately from PixiePixel because the recovered project history does not establish an alias, rename, or supersession relationship; detailed project scope remains pending its own manifest. |
| 237 | [PixieGIF](./pixiegif/) | `pixiegif` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/pixiegif/` | PixiePixel companion for deterministic sprite, animation, color, and sound generation, including 32×32/64×64 sprites, seeded identities, PixieGrid/PixieColor/PixieSound, PyQt5/CLI, and FFmpeg export workflows. |
| 238 | [PixiePixel](./pixiepixel/) | `pixiepixel` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/pixiepixel/` | ASCII/pixel-art provenance and ownership watermark system for embedding or associating deterministic visual identity marks with digital artifacts. |
| 239 | [PixieSprite](./pixiesprite/) | `pixiesprite` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/pixiesprite/` | Name-confirmed in-development ZZX-Labs visual/sprite project. Detailed project scope and its relationship to PixiePixel, PixelPixie, and PixieGIF remain pending canonical per-project manifest reconciliation. |
| 240 | [Polyhedra](./polyhedra/) | `polyhedra` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/polyhedra/` | Geometry and polyhedral-modeling utility for constructing, inspecting, and exporting polyhedral forms and related numeric data. |
| 241 | [PolyOrbit](./polyorbit/) | `polyorbit` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/polyorbit/` | PyQt5 GUI/CLI animated wireframe polyhedral-dice environment with gravity/orbits/rotation, mouse manipulation, oriented numerics, JSON themes/presets, timeline/history, and CSV export. |
| 242 | [PortraitGen](./portraitgen/) | `portraitgen` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/portraitgen/` | PortraitGen is a promptable portrait generation toolkit integrating Stable Diffusion and fine-tuned face models with style-locks, reproducibility seeds, and data-provenance tags for creative and research applications. |
| 243 | [PrimeNumHexGenSeq](./primenumhexgenseq/) | `primenumhexgenseq` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/primenumhexgenseq/` | Prime-number and hexadecimal sequence-generation utility for reproducible mathematical/number-theory experiments. |
| 244 | [PRNGBigNum](./prngbignum/) | `prngbignum` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/prngbignum/` | Large-pseudorandom-integer generator for cryptographic experiments, statistical testing, and numeric stress tests. |
| 245 | [Project Mongoose](./project-mongoose/) | `project-mongoose` | `1.0.0` | `alpha` | Linux, Windows, macOS | `/projects/software/project-mongoose/` | Local-first, passive, evidence-first OSINT research environment for reproducible public-source cyber-intelligence casework, provenance, claims, hypotheses, graphs, reports and hashed handoff bundles. |
| 246 | [PRONER](./proner/) | `proner` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/proner/` | Private adult content organizer and encrypted library system for managing notes, bookmarks, media references, and research collections. Cross-platform builds include Android (.apk) and desktop binaries for Linux, macOS, and Windows. |
| 247 | [PRONER-OS](./proneros/) | `proneros` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/proneros/` | Hardened sandboxed desktop operating profile for adult media workflows. Implements isolated network stacks, encrypted containers, and privacy-oriented utilities for creative professionals and researchers. |
| 248 | [ProtoTag](./prototag/) | `prototag` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/prototag/` | ProtoTag is a prototype video tagging environment for designing and testing MetaTagDB schemas, metadata rules, and user workflows in both CLI and PyQt5 GUI modes. |
| 249 | [PRYATKI](./pryatki/) | `pryatki` | `0.9.0` | `alpha` | Linux, Windows, macOS | `/projects/software/pryatki/` | Global conflict-accountability OSINT toolkit for time-bounded event reconstruction, evidence-backed unit/location research, non-interpolated map playback, GeoJSON export, media forensics, geolocation, and auditable source provenance. |
| 250 | [PWRP / PWRPV](./pwrp/) | `pwrp` | `2.5.0` | `alpha` | Linux, Windows, macOS | `/projects/software/pwrp/` | Unified local-first authorized-media acquisition and processing toolkit: PWRP handles audio/sample extraction and PWRPV handles video-only workflows, with ordinary-Firefox integration and explicit public-domain/owned/licensed/authorized-use boundaries. |
| 251 | [pymatrix](./pymatrix/) | `pymatrix` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/pymatrix/` | Python port/reimplementation of the classic cmatrix terminal visualization concept, maintained as its own ZZX-Labs project. |
| 252 | [PyOS](./pyos/) | `pyos` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS, Android, iOS | `/projects/software/pyos/` | PyOS is an open-source operating system written in Python targeting x86/x64 environments and cross-platform app-layer compatibility for Linux, Windows, macOS, Android, and iOS. |
| 253 | [PyTimecard](./pytimecard/) | `pytimecard` | `0.9.0-beta` | `beta` | Linux, Windows, macOS | `/projects/software/pytimecard/` | Time tracking, pay estimation, and labor analytics system for contractors and distributed teams. Focuses on auditable logs, offline-first records, and exportable summaries. |
| 254 | [PyTimecard (APK)](./pytimecard-apk/) | `pytimecard-apk` | `0.9.0-beta` | `beta` | Android | `/projects/software/pytimecard-apk/` | Native Android APK companion for PyTimecard providing mobile timecard entry, shift logs, and offline-first export. |
| 255 | [QTARD](./qtard/) | `qtard` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/qtard/` | Internal PyQt rapid-GUI prototyping framework and attribution-signature provenance tool used in the ZZX-Labs authenticity/provenance tooling lineage. |
| 256 | [RailGuru](./railguru/) | `railguru` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/railguru/` | RailGuru is a comprehensive rail travel intelligence and logistics platform providing route planning, booking optimization, cost modeling, and itinerary generation. Integrates trains, flights, hotels, rentals, dining, and entertainment with offline-first caching and live API synchronization. |
| 257 | [Ramanujan](./ramanujan/) | `ramanujan` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/ramanujan/` | Ramanujan is an open-source voice training and TTS system integrating Coqui (MozillaTTS), Piper, eSpeak-NG, and pyttsx3 with CLI and PyQt5 GUI for offline, modular speech synthesis, OSC control, and dataset training. |
| 258 | [RandPassGeneratorKit](./randpassgeneratorkit/) | `randpassgeneratorkit` | `0.1.1` | `alpha` | Linux, Windows, macOS | `/projects/software/randpassgeneratorkit/` | Multi-language password and passphrase generation kit derived from the NSA RandPassGenerator lineage, with deterministic cross-language behavior, Diceware support, stronger generation modes, GUI/CLI wrappers, tests, and preserved upstream attribution/licensing. |
| 259 | [RandWiki](./randwiki/) | `randwiki` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/randwiki/` | Randomized encyclopedia-page retrieval and archival utility for discovery, offline preservation, and corpus generation. |
| 260 | [RCalc](./rcalc/) | `rcalc` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/rcalc/` | General-purpose calculator utility retained from the legacy ZZX-Labs software archive. |
| 261 | [RealIntel](./realintel/) | `realintel` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/realintel/` | Real estate intelligence platform analyzing property data, market trends, valuations, and geographic factors across global markets. |
| 262 | [Redlist](./redlist/) | `redlist` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/redlist/` | Structured list and indicator registry for maintaining normalized blocklists/watchlists and associated metadata. |
| 263 | [RedPanda](./t4np/redpanda/) | `redpanda` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/t4np/redpanda/` | RedPanda is the PRC-focused T4NP module, embedding jurisdiction-specific, native-illegal index schemes and structural fences to resist parsing, reuse, and exfiltration of protected source code in Chinese legal contexts. |
| 264 | [ResRou](./resrou/) | `resrou` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/resrou/` | Internal resource-routing and inventory-mapping utility retained from the legacy ZZX-Labs software archive. |
| 265 | [RGBRNG](./rgbrng/) | `rgbrng` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/rgbrng/` | RGBRNG is a color-based random number generator and palette explorer deriving entropy from live pixel differentials or static gradient values for cryptographic art, design, and randomness visualization. |
| 266 | [RoseBud](./rosebud/) | `rosebud` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/rosebud/` | RoseBud is a relentless, hilarious, drill-sergeant-style personal fitness coach that compresses daily conditioning, core durability, and strength maintenance into 30–120 minute sessions with mandatory breathwork + stretching rails and adaptive difficulty based on performance and recovery. |
| 267 | [RoseBud (APK)](./rosebud-apk/) | `rosebud-apk` | `0.1.0-alpha` | `alpha` | Android | `/projects/software/rosebud-apk/` | RoseBudAPK is the mobile field-device companion to RoseBud, using phone sensors (GPS, accelerometer/gyro, mic, camera) to verify cadence, distance/steps, form confidence, and session timing, then syncing locally and securely with the desktop basestation. |
| 268 | [S7Sentinel](./s7sentinel/) | `s7sentinel` | `0.3.0` | `stable` | Linux, Windows, macOS | `/projects/software/s7sentinel/` | S7Sentinel is a defensive, read-only OT/ICS security framework for Siemens S7 PLC security assessment and AI-agentic intrusion detection. Implements AA26-231A hardening checks, TCP/102 exposure analysis, engineering-workstation artifact hunting, normalized telemetry analytics, and MITRE ATT&CK/D3FEND mapping without PLC writes, exploit execution, credential attacks, or Internet-wide scanning. |
| 269 | [Safai Karta](./safai_karta/) | `safai_karta` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/safai_karta/` | Safai Karta is a Python video filename filtering, normalization, and sanitization utility that detects series patterns, cleans filenames, and organizes directories for metadata preparation. |
| 270 | [Saptacrypt](./saptacrypt/) | `saptacrypt` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/saptacrypt/` | Cryptography research toolkit spanning historical/ancient cipher workflows plus modern authenticated container, KDF, key-derivation, armored output, and secure-I/O components with GUI/CLI entrypoints. |
| 271 | [satperPerson](./spp/) | `spp` | `0.2.0-alpha` | `alpha` | Web, Linux, Windows, macOS | `/projects/software/spp/` | satperPerson calculates the real-time fair share of Bitcoin circulation per human being using live blockchain supply data and continuous world population modeling to visualize satoshi-per-person equality through time. |
| 272 | [ScopeZ](./scopez/) | `scopez` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/scopez/` | Parent suite for sixteen ZZX-Labs Scope analysis tools spanning identity, email, IP, MAC, telecom, geospatial, Bitcoin, domain, user, device, network, temporal, behavioral, relationship, data, and signal analysis. |
| 273 | [Scuzzlebutt](./scuzzlebutt/) | `scuzzlebutt` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scuzzlebutt/` | Scuzzlebutt is a PDF-centric data aggregation and analysis system focused on identifying redactions, extracting surrounding metadata, and correlating repeated redaction patterns to build structured OSINT databases from large document corpora. |
| 274 | [SD-GUI](./sd-gui/) | `sd-gui` | `0.4.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/sd-gui/` | SD-GUI is a Stable Diffusion graphical interface featuring model management, parameter presets, queueing, prompt history, and gallery exports for AI-generated art workflows. |
| 275 | [Shairi Badalna](./shairi_badalna/) | `shairi_badalna` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/shairi_badalna/` | Shairi Badalna is a rules-based video renamer and sorter for large media libraries, preparing cleaned filenames and directories for MetaTagDB ingestion and tagging automation. |
| 276 | [Shaka-Kahn](./shaka-kahn/) | `shaka-kahn` | `0.2.0-internal` | `prototype` | Linux, Windows | `/projects/software/shaka-kahn/` | Shaka-Kahn is a CUDA-accelerated keysearch and brute-force research suite featuring modular kernels for cryptographic benchmarking, password testing, and distributed compute experiments (internal). |
| 277 | [SignalScope](./scopez/signalscope/) | `signalscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/signalscope/` | Signal analysis system for interpreting communication patterns, frequency domains, and encoded transmission data. |
| 278 | [SOIVA](./soiva/) | `soiva` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/soiva/` | SOIVA (Schmidt Ocean Institute Video Archiver) performs bulk ingestion, cut-point detection, and tagging of marine expedition footage using computer vision and metadata extraction pipelines. |
| 279 | [SparrowNet](./sparrownet/) | `sparrownet` | `1.0.0` | `alpha` | Linux, Windows, macOS | `/projects/software/sparrownet/` | Local-first cyber-conflict feed archive and enrichment platform with authorized Telegram ingestion, multilingual handling, IOC/entity extraction, media hashing, deduplication, timeline reconstruction, non-submitting-by-default VirusTotal enrichment, SQLite/FTS5, and PyQt5 GUI/CLI. |
| 280 | [Speciedex](./speciedex/) | `speciedex` | `0.4.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/speciedex/` | Speciedex is a global species taxonomy engine using AI-augmented classification, peer-verified data, and Bitcoin/Lightning Network incentives to maintain decentralized biodiversity records—explicitly excluding Homo sapiens. |
| 281 | [SpeciedexAPI](./speciedexapi/) | `speciedexapi` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/speciedexapi/` | SpeciedexAPI defines versioned machine-readable interfaces for canonical and normalized species records, taxonomy, provenance, statistics, maps, archives, literature, genetics, and third-party integrations. |
| 282 | [SpeciedexApp](./speciedexapp/) | `speciedexapp` | `0.1.0-alpha` | `alpha` | Android, Linux, Windows, macOS, Web | `/projects/software/speciedexapp/` | SpeciedexApp provides installable desktop, mobile, field, and offline access to identification, collections, annotations, observations, media, local search, and synchronization across the Speciedex ecosystem. |
| 283 | [SpeciedexArchives](./speciedexarchives/) | `speciedexarchives` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/speciedexarchives/` | SpeciedexArchives is the long-term preservation layer for provider snapshots, historical classifications, releases, documents, media, schemas, licenses, manifests, reports, checksums, and reproducible recovery packages. |
| 284 | [SpeciedexCore](./speciedexcore/) | `speciedexcore` | `0.4.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/speciedexcore/` | SpeciedexCore provides the full-node and light-node backends for the Speciedex protocol, hosting inference kernels, taxonomy services, and archival nodes that process high-volume global biodiversity data. |
| 285 | [SpeciedexExplorer](./speciedexexplorer/) | `speciedexexplorer` | `0.3.0-alpha` | `alpha` | Web, Linux, Windows, macOS | `/projects/software/speciedexexplorer/` | SpeciedexExplorer is a real-time explorer for Speciedex taxonomy chains, lineage trees, habitat data, and extinction records, with user dashboards, API, and integrated social/email sharing. |
| 286 | [SpeciedexGeneticBank](./speciedexgeneticbank/) | `speciedexgeneticbank` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/speciedexgeneticbank/` | SpeciedexGeneticBank links non-human species records with genomes, genes, sequences, markers, specimens, accession identifiers, repositories, and genetic research through interoperable provenance-aware records. |
| 287 | [SpeciedexNet](./speciedexnet/) | `speciedexnet` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/speciedexnet/` | SpeciedexNet is a federated P2P knowledge network for distributed biodiversity research. It enables signed, versioned contributions, encrypted field communications, and conservation telemetry linked to market incentives. |
| 288 | [SpeciedexTerminal](./speciedexterminal/) | `speciedexterminal` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/speciedexterminal/` | SpeciedexTerminal provides command-line workflows for advanced taxonomy queries, batch processing, provider synchronization operations, exports, diagnostics, reports, archival tasks, and automation over generated Speciedex indexes and SQLite shards. |
| 289 | [SpeciedexWeb](./speciedexweb/) | `speciedexweb` | `0.1.0-alpha` | `alpha` | Web, Linux, Windows, macOS | `/projects/software/speciedexweb/` | SpeciedexWeb is the browser-based public interface for searching, reading, comparing, learning from, and downloading Speciedex records, with species pages, taxonomic navigation, maps, media, and open-data access. |
| 290 | [Sputnik](./sputnik/) | `sputnik` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/sputnik/` | Service monitoring and heartbeat utility using Python/curl-style checks for lightweight local and remote availability tracking. |
| 291 | [StarInDB](./starindb/) | `starindb` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/starindb/` | Name-confirmed in-development ZZX-Labs project retained in the canonical roster. Detailed scope, stack, version, and per-project route metadata are pending reconciliation from the project repository/manifests. |
| 292 | [StegoMicrodot](./stegomicrodot/) | `stegomicrodot` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/stegomicrodot/` | StegoMicrodot is a high-density microdot and halftone steganography toolkit supporting printer calibration, embedded ciphertext encoding, and multi-layer decoding. |
| 293 | [Stephenizer](./stephenizer/) | `stephenizer` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/stephenizer/` | Stephenizer is a voice FX transformer using text-to-speech prosody shaping and formant filters to produce electrolarynx-style synthetic voices with adjustable tone and timbre parameters. |
| 294 | [STIRNG](./stirng/) | `stirng` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/stirng/` | Health-risk calculation and Monte Carlo research tool using prevalence datasets, partner-count modeling, ratio calculations, GUI/CLI workflows, and planned local/global map variants. |
| 295 | [STOA](./stoa/) | `stoa` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/stoa/` | STOA (Savings Timelock-Out Accounts) provides Bitcoin policy templates, locking scripts, and auditable dashboards for delayed spending and escrow-based time-locked savings instruments. |
| 296 | [StrainStringDB](./strainstringdb/) | `strainstringdb` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/strainstringdb/` | Cannabis strain-label, alias, and string-normalization database/tool for cleaning and reconciling cultivar naming across datasets. |
| 297 | [Stubler](./stubler/) | `stubler` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/stubler/` | Name-confirmed in-development ZZX-Labs project retained in the canonical roster. Detailed scope, stack, version, and per-project route metadata are pending reconciliation from the project repository/manifests. |
| 298 | [SubCircus](./subcircus/) | `subcircus` | `0.3.0-alpha` | `alpha` | Web, Linux, Windows, macOS | `/projects/software/subcircus/` | SubCircus is an EDM live-streaming platform for DJs offering broadcast scheduling, chat, VOD clipping, and Bitcoin microtransaction tipping via Lightning Network integration. |
| 299 | [SuperCleaner](./supercleaner/) | `supercleaner` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/supercleaner/` | Local housekeeping and cleanup utility implemented with Bash/Python workflows for repeatable workstation maintenance. |
| 300 | [SynthLavaRNG](./synthlavarng/) | `synthlavarng` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/synthlavarng/` | SynthLavaRNG is a Lavarand-inspired offline entropy harvester using real-time visual chaos sources, SHA3-256 hashing, and HMAC-DRBG mixing with optional BitRNG blending for secure random number generation. |
| 301 | [T4NP (The 4 Noble Pillars)](./t4np/) | `t4np` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/t4np/` | T4NP is a preventative source-code protection suite built around transparent, jurisdiction-aware defensive release controls. The root controller coordinates eight operator-defined jurisdiction profiles for source inventory, provenance, checksum manifests, license/build gates, human review, and explicit distribution policy. |
| 302 | [TelecomScope](./scopez/telecomscope/) | `telecomscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/telecomscope/` | Telecommunications analysis platform covering phone numbers, IMSI, IMEI, carrier allocation, and signaling patterns for probabilistic user and device attribution. |
| 303 | [TerVIS](./tervis/) | `tervis` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/tervis/` | TerVIS (Terrestrial Video Identification System) performs TensorFlow-based vision and audio analysis for identifying terrestrial species, providing frame-by-frame recognition and pattern detection for biodiversity datasets. |
| 304 | [TerVIS-RNGvG](./tervis-rngvg/) | `tervis-rngvg` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/tervis-rngvg/` | TerVIS-RNGvG (Randomized Next-Gen Video Generator) generates synthetic terrestrial video datasets via augmentation, frame interpolation, and noise modeling for AI training and testing pipelines. |
| 305 | [Thumbzilla](./thumbzilla/) | `thumbzilla` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/thumbzilla/` | Media thumbnail/contact-sheet generator built around Python and FFmpeg for local video/image cataloging. |
| 306 | [TibetsGate](./tibetsgate/) | `tibetsgate` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/tibetsgate/` | TibetsGate is a defensive security hardening suite and operating environment focused on privacy, resilience, and operational continuity for distributed organizations, emphasizing auditability and local sovereignty. |
| 307 | [TimeScope](./scopez/timescope/) | `timescope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/timescope/` | Temporal analysis engine modeling time-based patterns, activity cycles, and event correlations across datasets. |
| 308 | [TLDR](./tldr/) | `tldr` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/tldr/` | Concise document/research summarization utility retained as a small standalone local tool. |
| 309 | [TrackerTally](./trackertally/) | `trackertally` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/trackertally/` | Privacy-first behavioral tracking system for consumables and habits with time-based analytics and offline-first logs designed for reduction workflows and long-term self-audit. |
| 310 | [TrackerTally (APK)](./trackertally-apk/) | `trackertally-apk` | `1.0.0` | `stable` | Android | `/projects/software/trackertally-apk/` | Native Android APK version of TrackerTally for mobile habit tracking with offline-first storage and controlled export. |
| 311 | [Tracy](./project-mongoose/tracy/) | `tracy` | `1.0.0` | `alpha` | Linux, Windows, macOS | `/projects/software/project-mongoose/tracy/` | Analyst-facing CLI and optional PyQt5 GUI for Project Mongoose, focused on passive, lawful public-source cyber casework and evidence-backed analytic workflows. |
| 312 | [TripForge](./tripforge/) | `tripforge` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android | `/projects/software/tripforge/` | TripForge is a global travel planning and logistics system for itinerary creation, budgeting, booking integration, and experience optimization across cities and remote destinations. |
| 313 | [TrustFun](./trustfun/) | `trustfun` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/trustfun/` | TrustFun is a financial planning and savings system designed for long-term goal tracking, budgeting, and structured capital allocation with optional Bitcoin integration. |
| 314 | [URLScraper (Firefox Add-on)](./urlscraper-firefox-browser-addon/) | `urlscraper-firefox-browser-addon` | `0.3.0-alpha` | `alpha` | Firefox, Windows, Linux, macOS | `/projects/software/urlscraper-firefox-browser-addon/` | URLScraper is a Firefox extension that backs up all open tabs/URLs to TXT, CSV, JSON, or SQL with filters, de-duplication, tagging, and session-friendly exports. |
| 315 | [UserScope](./scopez/userscope/) | `userscope` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/scopez/userscope/` | Username and handle analysis engine correlating identities across platforms, services, and leaked datasets. |
| 316 | [UUIDGen](./uuidgen/) | `uuidgen` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/uuidgen/` | UUID generation and validation utility with software and hardware-oriented generation workflows. |
| 317 | [VideoSort](./videosort/) | `videosort` | `0.4.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/videosort/` | VideoSort is a modular Python toolkit for sanitizing, organizing, and formatting video filenames across large archives using rules, patterns, and exportable manifests. |
| 318 | [VidGhee](./vidghee/) | `vidghee` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vidghee/` | VidGhee is a PyQt5 video-to-GIF and frame extraction GUI that supports trimming, thumbnailing, meme capture, and batch export workflows. |
| 319 | [VidTag](./vidtag/) | `vidtag` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/vidtag/` | VidTag is a local-first video metadata tagging and cataloging tool for organizing video libraries, extracting technical metadata, assigning tags and notes, generating poster frames, computing file hashes, and exporting portable JSON/CSV sidecars for archival workflows. |
| 320 | [VidUniSUI](./vidunisui/) | `vidunisui` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vidunisui/` | Unified local-first video utilities interface built around Python and FFmpeg for common inspection, conversion, extraction, and media-processing workflows. |
| 321 | [Vikram](./vikram/) | `vikram` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vikram/` | Vikram is a Python GUI explorer for local files that adds schema-aware search, inline viewers, and optional VR-oriented navigation controls and interfaces. |
| 322 | [Vipassana Meditation Console (VMC)](./vmc/) | `vmc` | `0.1.0-alpha` | `alpha` | Linux, Embedded | `/projects/software/vmc/` | Dedicated meditation system integrating guided sessions, breathing protocols, and sensory feedback across software and embedded hardware platforms. |
| 323 | [Vishal](./vishal/) | `vishal` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vishal/` | Vishal is a Python audiovisual session ecosystem focused on tranquility and relaxation, combining ambient visuals, soundscapes, and session scripting in a PyQt5 GUI. |
| 324 | [Vishnu](./vishnu/) | `vishnu` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vishnu/` | Vishnu is a Python GUI ecosystem for synchronized audio visualizations designed to complement VLC visualizers and other media players. |
| 325 | [VLC AlarmClock](./vlc-alarmclock/) | `vlc-alarmclock` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vlc-alarmclock/` | VLC AlarmClock schedules VLC to open specific media or playlists at defined times with optional fade-in, repeat, and profile-based alarm presets. |
| 326 | [VLC Ticker](./vlc-ticker/) | `vlc-ticker` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vlc-ticker/` | VLC Ticker is a PyQt5 GUI overlay that displays the currently playing VLC media’s title and tag metadata (ID3-like) as a live, customizable ticker. |
| 327 | [VLC2DiscordStatus](./vlc2discordstatus/) | `vlc2discordstatus` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/vlc2discordstatus/` | Real-time integration between VLC media playback and Discord Rich Presence displaying track metadata, playback time, and media state. |
| 328 | [VMF](./vmf/) | `vmf` | `1.0.0` | `alpha` | Linux, Windows, macOS | `/projects/software/vmf/` | Template-driven voicemail production toolkit with PyQt5 GUI/CLI, TTS import/preview, music and FX processing, ducking, silence/beep assembly, template substitution, and project save/load workflows. |
| 329 | [Voise](./voise/) | `voise` | `0.4.0-alpha` | `alpha` | Windows, Linux, macOS | `/projects/software/voise/` | Real-time voice changer and vocoder supporting STT↔TTS routing, FX chains, and high-quality multitrack exports for live or studio use. |
| 330 | [VQR](./vqr/) | `vqr` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vqr/` | QR/code generation utility and web tool for deterministic creation and export of machine-readable codes. |
| 331 | [VVArDriving](./vvardriving/) | `vvardriving` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/vvardriving/` | Vehicle-driving simulation project retained from the legacy ZZX-Labs software roster. |
| 332 | [WarpDrive](./warpdrive/) | `warpdrive` | `1.0.0` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/warpdrive/` | Private self-hosted encrypted large-file/media storage system with a Python/FastAPI daemon, CLI, PyQt5 controller, resumable uploads, encrypted metadata/storage, multi-hash inventory and a separately publishable static web client. |
| 333 | [Wendelizer](./wendelizer/) | `wendelizer` | `0.3.0-alpha` | `alpha` | Windows, Linux, macOS | `/projects/software/wendelizer/` | Voice FX transformer tuned to Wendel (of Frisky Dingo)-like vocal formants; supports live and recorded pipelines with adjustable synthesis filters. |
| 334 | [WestAfricanLion](./t4np/westafricanlion/) | `westafricanlion` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/t4np/westafricanlion/` | WestAfricanLion is the Nigeria-focused T4NP jurisdiction profile for defensive source-distribution controls, provenance enforcement, release gating, and build-policy checks in Nigerian deployment contexts. |
| 335 | [WikiSpecies-Core](./wikispeciescore/) | `wikispeciescore` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/wikispeciescore/` | Core schemas and loaders for offline species research—synchronizing WikiSpecies data with Speciedex for integrated taxonomy research and archival. |
| 336 | [Wiper](./wiper/) | `wiper` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/wiper/` | Secure cleanup/data-destruction utility for intentionally removing selected local data under explicit operator control. |
| 337 | [WireFeed](./wirefeed/) | `wirefeed` | `0.3.0-alpha` | `alpha` | Windows, Linux, macOS | `/projects/software/wirefeed/` | RSS news and update feed GUI built in Python, offering keyword filtering, deduplication, overlay modes, and exportable lists for research dashboards. |
| 338 | [WoClock](./woclock/) | `woclock` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/woclock/` | Clock, timer, and scheduling utility retained from the legacy ZZX-Labs software roster. |
| 339 | [Woise](./woise/) | `woise` | `0.3.0-alpha` | `alpha` | Windows, Linux, macOS | `/projects/software/woise/` | White-noise generator and soundscape lab featuring filters, LFOs, MIDI control, and customizable preset packs for audio environments and focus tools. |
| 340 | [WordHarvest](./wordharvest/) | `wordharvest` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/wordharvest/` | Deterministic wordlist harvesting and balancing system for building large controlled vocabularies (ZZX-108K) and deriving Diceware lists (ZZX-7776) from document corpora using a strict space-delimited token model. Designed for offline-first auditing, controlled distribution, and reproducible list partitioning workflows. |
| 341 | [WordsOfSatoshi](./wordsofsatoshi/) | `wordsofsatoshi` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/wordsofsatoshi/` | Bitcoin-focused text/archive project for collecting, preserving, indexing, and presenting Satoshi-era writings and related primary-source material. |
| 342 | [WYTY](./wyty/) | `wyty` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/wyty/` | Local knowledge and thought-capture utility for organizing personal/research notes into a reusable structured archive. |
| 343 | [XConStats](./xconstats/) | `xconstats` | `0.2.0-alpha` | `alpha` | Windows, Linux | `/projects/software/xconstats/` | Controller telemetry utility monitoring Xbox wireless controller charge, battery health, and session duration with predictive time-remaining analysis. |
| 344 | [YTRP](./ytrp/) | `ytrp` | `0.5.0-alpha` | `alpha` | Windows, Linux, macOS | `/projects/software/ytrp/` | YTRP/YTRPV suite for automated YouTube audio/video downloading via yt-dlp, FFmpeg, and Mutagen; includes cookies, archives, logs, and error-handling with VPN rotation. |
| 345 | [ZeroX](./zerox/) | `zerox` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/zerox/` | Python-only private E2EE instant-messaging and streaming application/UI project with Qt helpers, themes, menus, settings, and desktop application infrastructure. |
| 346 | [ZeroX64 (Ƶ64)](./z64/) | `z64` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/z64/` | Deterministic reversible Base64 surface-translation toolkit with Ƶ64u/Ƶ64A profiles, GUI/CLI workflows, envelopes, validation, contacts/profiles, and optional GPG/OpenPGP piping. It is encoding/translation, not encryption. |
| 347 | [ZIRA](./zira/) | `zira` | `0.4.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zira/` | ZIRA (Zero-trust Intel Recon AI Agent) — adaptive multi-domain intelligence assistant integrating GPT-like reasoning, OSINT, and internal analytics systems. |
| 348 | [Zmatrix](./zmatrix/) | `zmatrix` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/zmatrix/` | Modernized terminal Matrix-style visualization project with a multi-language implementation program spanning native and scripting runtimes. |
| 349 | [Zorean 3d6+](./zorean-3d6-plus/) | `zorean-3d6-plus` | `1.0.0` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/zorean-3d6-plus/` | Offline consent-first adult 18+ dice/oracle game engine with 3d6 core mechanics, dice pools and accent dice, dependency-free Python CLI, browser application, machine-readable tables, tests and printable reference material. |
| 350 | [Zorean Ritual Altar](./zorean-ritual-altar/) | `zorean-ritual-altar` | `0.1.0-alpha` | `planned` | Linux, Windows, macOS, Web | `/projects/software/zorean-ritual-altar/` | Planned full Zorean tabletop/online game engine combining altar presentation, tablets/cards/dice, solo/bot/multiplayer modes, player progression, history and consent-aware adult 18+ session controls. |
| 351 | [Zorean Tablet Studio](./zorean-tablet-studio/) | `zorean-tablet-studio` | `2.0.0` | `alpha` | Linux, Windows, macOS | `/projects/software/zorean-tablet-studio/` | Offline Python/PyQt5 authoring, correction, validation, casting, indexing, search and exchange environment for the Zorean ordered-dice tablet JSON corpus, including the 132-tablet guidebook set. |
| 352 | [ZoreForge](./zoreforge/) | `zoreforge` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zoreforge/` | ZoreForge is a procedural lore and world-building engine designed for generating structured narratives, entities, and systems within the Zore universe. It integrates deterministic RNG, dice-based generation systems, structured outline construction, and modular content libraries to enable scalable creation of alternate reality lore, environments, and entities. |
| 353 | [ZZX Bitnodes](./zzxbitnodes/) | `zzxbitnodes` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Web | `/projects/software/zzxbitnodes/` | ZZX-Labs Bitcoin node crawler, enrichment, geographic indexing, map generation and operational GUI/CLI/daemon suite, supporting IPv4/IPv6/Tor/I2P node observations and locally generated public map artifacts. |
| 354 | [ZZX Bitnodes Map Host](./zzxbitnodes/maphost/) | `zzxbitnodes-maphost` | `0.1.0-alpha` | `alpha` | Linux, Web | `/projects/software/zzxbitnodes/maphost/` | Map-publication and validation component for ZZX Bitnodes that builds public-safe map artifacts from real coordinate-bearing node data and explicitly rejects synthetic geolocation fallbacks. |
| 355 | [ZZX GitHub Stats](./zzx-github-stats/) | `zzx-github-stats` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/zzx-github-stats/` | Self-hosted GitHub analytics and reporting dashboard that generates SVG-based statistics and summaries without third-party tracking. Built for reproducible project telemetry and privacy-preserving publication. |
| 356 | [ZZX ProjectOps](./projectops/) | `projectops` | `1.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/projectops/` | Operational control plane for the ZZX-Labs projects tree: inventories projects/modules, validates routes/manifests, tracks native alpha and JavaScript-mirror parity, plans work, records sessions, imports Git activity, and produces progress reports. |
| 357 | [ZZX++](./zzxpp/) | `zzxpp` | `0.6.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxpp/` | Desktop C++/Python GUI/CLI counterpart to Android++, focused on offline-first editing, encryption tooling, and transformation pipelines with extensible plugin surfaces. |
| 358 | [ZZX-0GP](./zzx0gp/) | `zzx0gp` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzx0gp/` | ZZX-0GP is a cryptographic framework inspired by GPG/PGP, using Base32 and Base58 encodings with customizable profiles and batch operations for identity management, message signing, and encryption tasks. |
| 359 | [ZZX-ASB](./zzxasb/) | `zzxasb` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxasb/` | Audio Soundboard System — local-first pad-based audio launcher for clips, cues, samples, alerts, and ZZX voice-stack outputs. Supports multi-bank soundboards, per-pad volume and looping, hotkeys, master output control, local clip assignment, portable board profiles, and routing integration with ZZX-STT, ZZX-TTS, and ZZX-VCS. |
| 360 | [ZZX-BBC](./zzxbbc/) | `zzxbbc` | `0.2.0-alpha` | `alpha` | Embedded, Linux, Windows | `/projects/software/zzxbbc/` | ZZX-BBC is a LoRA mesh communicator designed in a BlackBerry-style form factor—offering encrypted text, email, audio/video, and file transfers over Wi-Fi, GSM, 5G, and LoRA mesh networks. |
| 361 | [ZZX-BCF](./zzx-bcf/) | `zzx-bcf` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/zzx-bcf/` | Name-confirmed in-development ZZX-Labs project. Scope metadata is pending canonical per-project manifest reconciliation. This identity is intentionally kept distinct from the already documented ZZX-BCS Billing & Compensation System. |
| 362 | [ZZX-BCS](./zzxbcs/) | `zzxbcs` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxbcs/` | ZZX-BCS (Billing & Compensation System) is an internal, private financial management system for ZZX-Labs used to track billing, compensation, retainers, expenses, budgets, and treasury flows across projects and personnel. |
| 363 | [ZZX-Bitcoin-Ticker](./zzx-bitcoin-ticker/) | `zzx-bitcoin-ticker` | `1.0.0` | `alpha` | Linux, Windows, macOS | `/projects/software/zzx-bitcoin-ticker/` | Standalone Bitcoin ticker and analytics desktop application with PyQt5 GUI/CLI, currency conversion, BitAvg, Native/Global BPI modes, weighted/unweighted pricing, purchasing-power references, and local historical storage. |
| 364 | [ZZX-CEX](./zzxcex/) | `zzxcex` | `0.1.0-alpha` | `alpha` | Linux, Windows | `/projects/software/zzxcex/` | CentralizedExchange research clone environment for Bitcoin-only transactional data analysis, used for internal ZZX financial simulations and model testing. |
| 365 | [ZZX-Core](./zzxcore/) | `zzxcore` | `0.4.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxcore/` | ZZX-Core is the unified backend controller and orchestration system for all ZZX services—providing a GUI host for modular APIs, stack control, and mirrored backend operations. |
| 366 | [ZZX-DES](./zzxdes/) | `zzxdes` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxdes/` | Directory Explorer System (DES) — a hierarchical file and data browser featuring tagging, previews, metadata search, and secure bulk operations for archival data management. |
| 367 | [ZZX-DEX](./zzxdex/) | `zzxdex` | `0.1.0-alpha` | `alpha` | Linux, Windows | `/projects/software/zzxdex/` | DecentralizedExchange research clone environment for Bitcoin-only peer-to-peer transactional data studies, running internal Lightning-based liquidity models. |
| 368 | [ZZX-FFK](./zzxffk/) | `zzxffk` | `0.4.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxffk/` | Forensic Field Kit (FFK) — a modular cross-platform forensic analysis suite for disk, memory, and network inspection. Includes both CLI and PyQt5 GUI interfaces with exportable audit trails. |
| 369 | [ZZX-KLD](./zzxkld/) | `zzxkld` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxkld/` | Key Logger Defense suite providing real-time input monitoring, keystroke encryption, and anomaly detection across user systems. Designed to detect unauthorized input capture and mitigate data exfiltration attempts through randomized input masking, integrity validation, and active threat countermeasures. Includes CLI, GUI, and system daemon modes for Windows, Linux, and macOS. |
| 370 | [ZZX-Labs Live BTC GIF Widget](./zzx-live-gif-widget/) | `zzx-live-gif-widget` | `2.0.0` | `alpha` | Web | `/projects/software/zzx-live-gif-widget/` | Dependency-free <zzx-btc-gif> web component that randomly/adaptively plays animated GIFs and composites current Bitcoin price, movement, source and market state into each rendered canvas frame. |
| 371 | [ZZX-Mempool-Visualizer](./zzx-mempool-visualizer/) | `zzx-mempool-visualizer` | `2.3.0` | `alpha` | Linux, Windows, macOS | `/projects/software/zzx-mempool-visualizer/` | Standalone high-density Bitcoin mempool visualization workstation with live reconciliation, block-tip transaction removal, large transaction-set rendering, physics/visual presets, inspection panels, and PyQt5 GUI/CLI workflows. |
| 372 | [ZZX-MSP](./zzxmsp/) | `zzxmsp` | `0.2.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxmsp/` | Mnemonic Seed Phrase Standard — an open, high-entropy, alphabetically indexed mnemonic system designed as a BIP39 alternative for wallets, cold storage, and identity anchoring. |
| 373 | [ZZX-OSC](./zzxosc/) | `zzxosc` | `0.2.0-beta` | `beta` | Linux, Windows, macOS, Raspberry Pi | `/projects/software/zzxosc/` | ZZXOSC is a real-time oscilloscope and spectral analysis suite integrating USB audio, SDR, and VST plugin pipelines. Supports multi-channel monitoring, FFT visualization, forensic waveform capture, and signal export in standard formats. Designed for laboratory diagnostics, music visualization, and cyber forensics. |
| 374 | [ZZX-Pass](./zzx-pass/) | `zzx-pass` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzx-pass/` | Credential, secret, and token management utility using local Python workflows with GPG-backed protection and explicit user-controlled storage. |
| 375 | [ZZX-SBS](./zzxsbs/) | `zzxsbs` | `0.3.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxsbs/` | Site Builder System — unified page generator for projects, portfolios, and docs from a single manifest. Includes CLI and GUI modes with live preview and publication automation. |
| 376 | [ZZX-SSS](./zzxsss/) | `zzxsss` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Kali | `/projects/software/zzxsss/` | Modular Server Stack System that automates setup, deployment, and synchronization of ZZX-Labs backend environments using direct local Nginx, Flask, Gunicorn, database, VPN, reverse-proxy, SSL, and private API orchestration for mirrored .io and .onion services. |
| 377 | [ZZX-SST](./zzxsst/) | `zzxsst` | `0.5.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxsst/` | Site Scaffolding Tool — modular generator for uniform project pages, docs, and portfolios. CLI and PyQt5 GUI modes with automatic README/LICENSE imports and per-project hooks. |
| 378 | [ZZX-STT](./zzxstt/) | `zzxstt` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxstt/` | Centralized Speech-to-Text system for ZZX-Labs’ adaptive AI framework. Integrates Whisper, DeepSpeech, and Vosk engines for multi-language transcription, diarization, and segmentation. Features live microphone capture, media file transcription, batch processing, timestamped JSON export, and cross-integration with ZZXTTS for full duplex voice systems. |
| 379 | [ZZX-TAS](./zzxtas/) | `zzxtas` | `0.2.0-alpha` | `alpha` | Android, Termux | `/projects/software/zzxtas/` | ZZX-TAS (Termux Android Suite) is an Android/Termux-native collection of ZZX-Labs tools, wrappers, and deployment scripts for running Bitcoin, AI, media, and security utilities directly on mobile devices. |
| 380 | [ZZX-TTS](./zzxtts/) | `zzxtts` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxtts/` | Modular Text-to-Speech system for ZZX-Labs’ adaptive AI stack. Provides voice synthesis routing across multiple engines (Coqui, MozillaTTS, Piper, and eSpeak-NG) with selectable timbres, languages, and character presets. Supports local rendering, OSC/IPC control, batch synthesis, and real-time output streaming for desktop, mobile, and embedded deployments. |
| 381 | [ZZX-VCS](./zzxvcs/) | `zzxvcs` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxvcs/` | Voice Changer System — advanced real-time voice modulation suite integrating pitch, formant, reverb, delay, chorus, distortion, and bit-crush effects. Supports live microphone input and routed outputs via Virtual Audio Cable, OBS, or Discord. Features PyQt5 GUI and CLI modes for performance tuning, voice profile saving, and dynamic FX chains with MIDI/LFO automation. |
| 382 | [ZZX-VSS](./zzxvss/) | `zzxvss` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS, Android, iOS, Web | `/projects/software/zzxvss/` | Verification Security System — Age-gated verification and credential vault for 18+ and 21+ adult content ecosystems. Uses secure facial imaging scans, photo ID capture, and facial-recognition matching to verify users while storing all documents in heavily encrypted form. User verification records can only be decrypted via per-user, court-authority key signing, providing a privacy-preserving, compliance-ready verification backbone for third-party platforms. |
| 383 | [ZZX-WorldFactbook](./zzx-worldfactbook/) | `zzx-worldfactbook` | `1.2.0-dev` | `development` | Linux, Windows, macOS | `/projects/software/zzx-worldfactbook/` | Long-horizon World Factbook corpus and publication system spanning historical editions, deterministic extraction/citations, OCR/image handling, normalized country datasets, SQL/site exports, archival year mapping, and interactive world-data visualization. |
| 384 | [zzxblogpost](./zzxblogpost/) | `zzxblogpost` | `1.0.0` | `stable` | Linux, Windows, macOS | `/projects/software/zzxblogpost/` | Offline-first academic and technical publishing toolchain for ZZX-Labs posts, bulletins, disclosures, and research notes, optimized for controlled release and reproducible builds. |
| 385 | [zzxblogpost (APK)](./zzxblogpost-apk/) | `zzxblogpost-apk` | `1.0.0` | `stable` | Android | `/projects/software/zzxblogpost-apk/` | Native Android APK companion for zzxblogpost enabling offline drafting, reading, and controlled export of posts and attachments. |
| 386 | [ZZXGCS](./zzxgcs/) | `zzxgcs` | `TBD` | `development` | Linux, Windows, macOS | `/projects/software/zzxgcs/` | Earlier grid-coordinate/word-list system whose corpus/filtering lineage feeds later Dicelocks work; retained as a distinct historical project identity. |
| 387 | [ZZXLOSS-BB (Open Source Book Builder)](./zzxloss-bb/) | `zzxloss-bb` | `0.1.0-alpha` | `alpha` | Linux, Windows, macOS | `/projects/software/zzxloss-bb/` | ZZXLOSS-BB is a structured book authoring and publishing system for assembling technical manuals, whitepapers, and narrative works with modular content blocks, versioning, and export pipelines. |
| 388 | [Тактична Мапа](./taktychna-mapa/) | `taktychna-mapa` | `1.0.3` | `alpha` | Linux, Windows, macOS | `/projects/software/taktychna-mapa/` | Local-first open-data mapping and civilian logistics workstation with PyQt GUI/CLI, MapLibre rendering, offline MBTiles, routing, truck constraints, geocoding, geohashes, 3D terrain/globe rendering, public-data feeds, lineage and authorized survey ingestion. |

## Notes

- `manifest.json` is the machine-readable source of truth for software-catalog metadata.
- Every catalog entry must have a unique `slug` and canonical `href`.
- New software should be added to the manifest and given a corresponding canonical project route before it is treated as deployed.
- Nested modules retain their own canonical route under the route family shown by their `href`.
- Individual projects may be experimental, alpha, beta, stable, superseded, planned, internal, source-available, or platform-specific; consult the project manifest rather than assuming one global maturity or license.
- `logo.png` is deployment-owned at the software root and at individual project roots where applicable.
- Shared root shell assets are `style.css`, `script.js`, `hook.css`, and `hook.js`.
- Project-specific functionality belongs inside the child project rather than being duplicated in this root README.
- Static browser pages must not claim native functionality that is not actually present.
- Local child manifests and route files must eventually be reconciled with the root manifest wherever the manifest audit marks them as pending.

## Updating this README

When the catalog changes:

1. update `projects/software/manifest.json`;
2. add, rename, or remove the corresponding project directory/route;
3. keep the project `manifest.json`, README, route metadata, and logo/assets synchronized;
4. regenerate the directory tree, alphabetical index, platform/status summaries, and catalog table from the manifest;
5. validate unique slugs, unique canonical routes, Markdown structure, and local assets before deployment.

## Validation

Run the included checker from `projects/software/`:

```bash
python tools/check_software_catalog_readme.py README.md manifest.json
```

The checker verifies catalog counts, row membership, canonical routes, duplicate slugs, duplicate routes, code-fence balance, and local README image references.
