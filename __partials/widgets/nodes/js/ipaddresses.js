// __partials/widgets/nodes/js/ipaddresses.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodeIPAddresses?.__version||0)>=1)return;

  function text(value){
    return String(value??"").trim();
  }

  function stripBrackets(host){
    const s=text(host);
    if(s.startsWith("[")&&s.endsWith("]"))return s.slice(1,-1);
    return s;
  }

  function splitHostPort(value){
    const raw=text(value);
    if(!raw)return {host:"",port:null};

    // Bracketed IPv6: [2001:db8::1]:8333
    const bracket=raw.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if(bracket){
      return {
        host:stripBrackets(bracket[1]),
        port:bracket[2]?Number(bracket[2]):null
      };
    }

    // Plain IPv4/domain with optional port.
    const oneColon=(raw.match(/:/g)||[]).length===1;
    if(oneColon){
      const m=raw.match(/^(.+):(\d+)$/);
      if(m){
        return {
          host:stripBrackets(m[1]),
          port:Number(m[2])
        };
      }
    }

    // Plain IPv6 without brackets. Do not guess a port from the last hextet.
    return {host:stripBrackets(raw),port:null};
  }

  function validIPv4(host){
    const parts=text(host).split(".");
    if(parts.length!==4)return false;

    for(const part of parts){
      if(!/^\d{1,3}$/.test(part))return false;
      const n=Number(part);
      if(n<0||n>255)return false;
      if(part.length>1&&part.startsWith("0"))return false;
    }

    return true;
  }

  function validIPv6(host){
    let s=text(host).toLowerCase();
    if(!s||!s.includes(":"))return false;

    // Remove zone id if present; public snapshots normally do not publish one.
    s=s.split("%")[0];

    // IPv4 tail.
    const lastColon=s.lastIndexOf(":");
    const tail=s.slice(lastColon+1);
    let ipv4Tail=false;

    if(tail.includes(".")){
      if(!validIPv4(tail))return false;
      ipv4Tail=true;
      s=s.slice(0,lastColon)+":0:0";
    }

    if(!/^[0-9a-f:]+$/.test(s))return false;
    if((s.match(/::/g)||[]).length>1)return false;

    const hasCompression=s.includes("::");
    const parts=s.split(":").filter(Boolean);

    if(parts.some(part=>part.length>4||!/^[0-9a-f]{1,4}$/.test(part))){
      return false;
    }

    const required=ipv4Tail?6:8;

    if(hasCompression)return parts.length<required;
    return parts.length===required;
  }

  function ipVersion(host){
    const value=stripBrackets(host);
    if(validIPv4(value))return 4;
    if(validIPv6(value))return 6;
    return 0;
  }

  function candidate(node){
    for(const value of [
      node?.ip,
      node?.host,
      node?.hostname,
      node?.address,
      node?.addr
    ]){
      const parsed=splitHostPort(value);
      if(ipVersion(parsed.host)){
        return {
          host:parsed.host,
          port:parsed.port
        };
      }
    }

    return {host:"",port:null};
  }

  function normalizedNetwork(node,version){
    const raw=text(node?.network).toLowerCase();
    if(version===4)return "ipv4";
    if(version===6)return "ipv6";
    return raw||"unknown";
  }

  function build(snapshot){
    const nodes=Array.isArray(snapshot?.nodes)?snapshot.nodes:[];
    const map=new Map();
    let overlayOrHostname=0;
    let missing=0;

    for(const node of nodes){
      const found=candidate(node);

      if(!found.host){
        const raw=text(node?.address||node?.hostname||node?.host);
        if(
          raw &&
          (
            /\.onion(?::\d+)?$/i.test(raw) ||
            /\.i2p(?::\d+)?$/i.test(raw) ||
            String(node?.network||"").toLowerCase()==="tor" ||
            String(node?.network||"").toLowerCase()==="i2p"
          )
        ){
          overlayOrHostname+=1;
        }else{
          missing+=1;
        }
        continue;
      }

      const version=ipVersion(found.host);
      const key=found.host.toLowerCase();
      const current=map.get(key)||{
        ip:found.host,
        version,
        network:normalizedNetwork(node,version),
        port:found.port,
        address:found.port
          ? (version===6?`[${found.host}]:${found.port}`:`${found.host}:${found.port}`)
          : found.host,
        count:0
      };

      current.count+=1;

      if(current.port==null&&found.port!=null){
        current.port=found.port;
        current.address=version===6
          ? `[${found.host}]:${found.port}`
          : `${found.host}:${found.port}`;
      }

      map.set(key,current);
    }

    const rows=[...map.values()]
      .sort((a,b)=>{
        if(a.version!==b.version)return a.version-b.version;
        return a.ip.localeCompare(b.ip,undefined,{numeric:true,sensitivity:"base"});
      })
      .map((row,index)=>Object.freeze({
        ...row,
        rank:index+1
      }));

    const ipv4=rows.filter(row=>row.version===4);
    const ipv6=rows.filter(row=>row.version===6);

    return Object.freeze({
      schema:"zzx-node-ip-addresses-v1",
      rows:Object.freeze(rows),
      ipv4:Object.freeze(ipv4),
      ipv6:Object.freeze(ipv6),
      count:rows.length,
      ipv4Count:ipv4.length,
      ipv6Count:ipv6.length,
      overlayOrHostname,
      missing,
      sourceNodeCount:nodes.length
    });
  }

  function all(snapshot){
    return build(snapshot).rows;
  }

  function strings(snapshot,{withPort=false}={}){
    return all(snapshot).map(row=>withPort?row.address:row.ip);
  }

  W.ZZXNodeIPAddresses=Object.freeze({
    __version:1,
    splitHostPort,
    ipVersion,
    build,
    all,
    strings
  });
})();
