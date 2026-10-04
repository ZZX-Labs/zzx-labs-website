(() => {
  "use strict";

  class AudioTaggerRecognition {
    constructor() {
      this.provider=null;
      this.name=null;
    }

    register(provider,name="custom") {
      if(provider!==null&&typeof provider!=="function") {
        throw new TypeError("Recognition provider must be a function or null.");
      }
      this.provider=provider;
      this.name=provider?String(name):null;
    }

    async recognize(record,file=null) {
      if(!this.provider) {
        throw new Error("No recognition provider is registered.");
      }

      const result=await this.provider({
        record:JSON.parse(JSON.stringify(record)),
        file
      });

      if(!result||typeof result!=="object") {
        throw new Error("Recognition provider returned no metadata object.");
      }

      const allowed=[
        "title","artist","album","albumArtist","genre",
        "track","year","composer","comment"
      ];

      const clean={};
      for(const key of allowed) {
        if(result[key]!=null)clean[key]=String(result[key]).trim();
      }
      if(result.confidence!=null)clean.confidence=Number(result.confidence);
      if(result.source!=null)clean.source=String(result.source);

      return clean;
    }
  }

  window.AudioTaggerRecognition=AudioTaggerRecognition;
})();
