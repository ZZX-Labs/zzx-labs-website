/* Local imagery only. WebGPU adds terrain relief; Canvas 2D remains usable. */
(function () {
  "use strict";

  const SHADER = `
    struct Globe {
      aspect:f32, yaw:f32, pitch:f32, zoom:f32,
      flat:f32, tactical:f32, relief:f32, realism:f32,
      sunLon:f32, sunDecl:f32, accentR:f32, accentG:f32,
      accentB:f32, width:f32, height:f32, flatLat:f32,
      tintR:f32, tintG:f32, tintB:f32, tintStrength:f32
    };
    @group(0) @binding(0) var<uniform> globe: Globe;
    @group(0) @binding(1) var image: texture_2d<f32>;
    @group(0) @binding(2) var elevation: texture_2d<f32>;
    @group(0) @binding(3) var imageSampler: sampler;
    struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
    @vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
      let corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
      let p = corners[i];
      var result: Vertex;
      result.position = vec4f(p, 0.0, 1.0);
      result.uv = vec2f((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
      return result;
    }
    @fragment fn fragment(input: Vertex) -> @location(0) vec4f {
      let pi = 3.141592653589793;
      let xy = vec2f((input.uv.x - 0.5) * 2.0 * max(globe.aspect, 1.0),
                     (0.5 - input.uv.y) * 2.0 * max(1.0 / globe.aspect, 1.0)) * 1.25 / globe.zoom;
      let radius2 = dot(xy, xy);
      var normal = vec3f(xy,sqrt(max(0.0,1.0-radius2)));
      var latitude:f32;
      var longitude:f32;
      if(globe.flat > 0.5){
        latitude=(0.5-input.uv.y)*3.141592653589793/globe.zoom+globe.flatLat;
        longitude=(input.uv.x-0.5)*2.0*pi/globe.zoom+globe.yaw;
        if(abs(latitude)>pi*0.5){discard;}
        normal=vec3f(0.0,0.0,1.0);
      }else{
        if(radius2 > 1.0){discard;}
        let ct=cos(globe.pitch);let st=sin(globe.pitch);
        let gy=ct*normal.y+st*normal.z;
        let gz=-st*normal.y+ct*normal.z;
        latitude=asin(clamp(gy,-1.0,1.0));
        longitude=atan2(normal.x,gz)+globe.yaw;
      }
      let u = fract(longitude / (2.0 * pi) + 0.5);
      let v=clamp(0.5-latitude/pi,0.0,1.0);
      var color=textureSampleLevel(image,imageSampler,vec2f(u,v),0.0).rgb;
      let luminance=dot(color,vec3f(.299,.587,.114));
      color=mix(color,luminance*vec3f(globe.tintR,globe.tintG,globe.tintB),globe.tintStrength);
      if (globe.tactical > 0.5) {
        let a = abs(fract((longitude + pi) / (pi / 12.0)) - 0.5);
        let b = abs(fract((latitude + pi * 0.5) / (pi / 12.0)) - 0.5);
        let grid = (1.0 - step(0.015, min(a, b))) * 0.24;
        color=color*.46+grid*vec3f(globe.accentR,globe.accentG,globe.accentB);
      }
      if(globe.relief>0.0 && globe.flat<.5){
        // Shaded Natural Earth relief is a visual height proxy. An installed
        // elevation raster may replace it without changing the renderer.
        let step=1.0/vec2f(textureDimensions(elevation));
        let east=dot(textureSampleLevel(elevation,imageSampler,vec2f(u+step.x,v),0.0).rgb,vec3f(.299,.587,.114));
        let west=dot(textureSampleLevel(elevation,imageSampler,vec2f(u-step.x,v),0.0).rgb,vec3f(.299,.587,.114));
        let north=dot(textureSampleLevel(elevation,imageSampler,vec2f(u,v-step.y),0.0).rgb,vec3f(.299,.587,.114));
        let south=dot(textureSampleLevel(elevation,imageSampler,vec2f(u,v+step.y),0.0).rgb,vec3f(.299,.587,.114));
        normal=normalize(normal+vec3f((west-east)*globe.relief,(north-south)*globe.relief,0.0));
      }
      let studio=.34+.66*max(0.0,dot(normal,normalize(vec3f(-.38,.48,1.0))));
      let sun=sin(latitude)*sin(globe.sunDecl)+cos(latitude)*cos(globe.sunDecl)*cos(longitude-globe.sunLon);
      let daylight=.10+.90*smoothstep(-.08,.08,sun);
      let light=select(mix(studio,daylight,globe.realism),1.0,globe.flat>.5);
      return vec4f(color*light+vec3f(.009,.017,.021),1.0);
    }
    struct MeshVertex {
      @builtin(position) position:vec4f,
      @location(0) uv:vec2f,
      @location(1) geo:vec2f,
      @location(2) normal:vec3f
    };
    @vertex fn meshVertex(@builtin(vertex_index) index:u32) -> MeshVertex {
      let cell=index/6u;let corner=index%6u;
      let col=cell%256u;let row=cell/256u;
      let dx=select(0u,1u,corner==1u||corner==2u||corner==4u);
      let dy=select(0u,1u,corner==2u||corner==4u||corner==5u);
      let uv=vec2f(f32(col+dx)/256.0,f32(row+dy)/128.0);
      let pi=3.141592653589793;
      let lon=(uv.x-.5)*2.0*pi;let lat=(.5-uv.y)*pi;
      let az=lon-globe.yaw;
      let raw=vec3f(cos(lat)*sin(az),sin(lat),cos(lat)*cos(az));
      let ct=cos(globe.pitch);let st=sin(globe.pitch);
      let turned=vec3f(raw.x,ct*raw.y-st*raw.z,st*raw.y+ct*raw.z);
      let sample=textureSampleLevel(elevation,imageSampler,uv,0.0).rgb;
      let visibleHeight=max(0.0,dot(sample,vec3f(.299,.587,.114))-.14);
      let radius=1.0+globe.relief*visibleHeight*.024;
      var out:MeshVertex;
      out.position=vec4f(turned.x*radius*.8*min(1.0,1.0/globe.aspect)*globe.zoom,
        turned.y*radius*.8*min(1.0,globe.aspect)*globe.zoom,
        clamp(.5-turned.z*radius*.25,0.0,1.0),1.0);
      out.uv=uv;out.geo=vec2f(lon,lat);out.normal=turned;
      return out;
    }
    @fragment fn meshFragment(input:MeshVertex) -> @location(0) vec4f {
      let pi=3.141592653589793;
      var color=textureSampleLevel(image,imageSampler,input.uv,0.0).rgb;
      let luminance=dot(color,vec3f(.299,.587,.114));
      color=mix(color,luminance*vec3f(globe.tintR,globe.tintG,globe.tintB),globe.tintStrength);
      if(globe.tactical>.5){
        let a=abs(fract((input.geo.x+pi)/(pi/12.0))-.5);
        let b=abs(fract((input.geo.y+pi*.5)/(pi/12.0))-.5);
        let grid=(1.0-step(.015,min(a,b)))*.24;
        color=color*.46+grid*vec3f(globe.accentR,globe.accentG,globe.accentB);
      }
      let studio=.34+.66*max(0.0,dot(input.normal,normalize(vec3f(-.38,.48,1.0))));
      let sun=sin(input.geo.y)*sin(globe.sunDecl)+
        cos(input.geo.y)*cos(globe.sunDecl)*cos(input.geo.x-globe.sunLon);
      let light=mix(studio,.10+.90*smoothstep(-.08,.08,sun),globe.realism);
      return vec4f(color*light+vec3f(.009,.017,.021),1.0);
    }`;

  async function createGPU(canvas, onLost) {
    if (!navigator.gpu || !window.isSecureContext) return null;
    // A preference is only a hint. The browser/OS chooses the actual adapter.
    const adapter = await navigator.gpu.requestAdapter({powerPreference:"high-performance"}) ||
      await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) return null;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({device, format, alphaMode:"premultiplied"});
    const module = device.createShaderModule({code:SHADER});
    if (module.getCompilationInfo) {
      const info = await module.getCompilationInfo();
      const error = info.messages.find(message => message.type === "error");
      if (error) throw Error(`Globe shader: ${error.message}`);
    }
    const groupLayout=device.createBindGroupLayout({entries:[
      {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
      {binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{}},
      {binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,texture:{}},
      {binding:3,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,sampler:{}}
    ]});
    const layout=device.createPipelineLayout({bindGroupLayouts:[groupLayout]});
    const pipeline = device.createRenderPipeline({
      layout,
      vertex:{module, entryPoint:"vertex"},
      fragment:{module, entryPoint:"fragment", targets:[{format}]},
      primitive:{topology:"triangle-list"}
    });
    const meshPipeline=device.createRenderPipeline({layout,
      vertex:{module,entryPoint:"meshVertex"},
      fragment:{module,entryPoint:"meshFragment",targets:[{format}]},
      primitive:{topology:"triangle-list",cullMode:"none"},
      depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"}
    });
    const uniform = device.createBuffer({size:80, usage:GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    const sampler = device.createSampler({addressModeU:"repeat", addressModeV:"clamp-to-edge",
      magFilter:"linear", minFilter:"linear"});
    let texture = null, elevation = null, bindGroup = null, destroyed = false;
    let depthTexture=null,depthSize="";
    function rebind(){
      if(!texture||!elevation)return;
      bindGroup=device.createBindGroup({layout:groupLayout,entries:[
        {binding:0,resource:{buffer:uniform}},{binding:1,resource:texture.createView()},
        {binding:2,resource:elevation.createView()},{binding:3,resource:sampler}
      ]});
    }
    function textureFrom(source){
      if(source.width>device.limits.maxTextureDimension2D||source.height>device.limits.maxTextureDimension2D)
        throw Error("Globe texture exceeds the current GPU's texture dimension");
      const next=device.createTexture({size:[source.width,source.height,1],format:"rgba8unorm",
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
      try{device.queue.copyExternalImageToTexture({source},{texture:next},[source.width,source.height]);}
      catch(error){next.destroy();throw error;}
      return next;
    }
    device.lost.then(() => {if (!destroyed) onLost();});
    return {
      kind:"WebGPU 3D relief",
      setTexture(source) {
        const next=textureFrom(source);texture?.destroy();texture=next;rebind();
      },
      setRelief(source){const next=textureFrom(source);elevation?.destroy();elevation=next;rebind();},
      draw(width, height, settings) {
        if (!bindGroup) return;
        const a=settings.accent||[.75,.84,.45],t=settings.tint||[1,1,1];
        device.queue.writeBuffer(uniform,0,new Float32Array([
          width/height,settings.yaw,settings.pitch,settings.zoom,
          Number(settings.flat),Number(settings.tactical),settings.relief,settings.realism,
          settings.sunLon,settings.sunDecl,a[0],a[1],a[2],width,height,settings.flatLat||0,
          t[0],t[1],t[2],settings.tintStrength||0
        ]));
        if(!settings.flat && depthSize!==`${width}:${height}`){
          depthTexture?.destroy();
          depthTexture=device.createTexture({size:[width,height],format:"depth24plus",
            usage:GPUTextureUsage.RENDER_ATTACHMENT});
          depthSize=`${width}:${height}`;
        }
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({colorAttachments:[{
          view:context.getCurrentTexture().createView(),
          clearValue:{r:0,g:0,b:0,a:0}, loadOp:"clear", storeOp:"store"
        }],...(settings.flat?{}:{depthStencilAttachment:{view:depthTexture.createView(),
          depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}})});
        pass.setPipeline(settings.flat?pipeline:meshPipeline);pass.setBindGroup(0, bindGroup);
        pass.draw(settings.flat?3:256*128*6);pass.end();
        device.queue.submit([encoder.finish()]);
      },
      destroy() {destroyed = true; texture?.destroy(); elevation?.destroy(); depthTexture?.destroy(); uniform.destroy(); context.unconfigure();}
    };
  }

  function createCPU(canvas) {
    const overlay = document.createElement("canvas");
    overlay.className = "wfb-globe-cpu";
    overlay.setAttribute("aria-hidden", "true");
    canvas.after(overlay);
    const screen = overlay.getContext("2d", {alpha:true});
    const buffer = document.createElement("canvas");
    const backing = buffer.getContext("2d", {willReadFrequently:true});
    let pixels = null, sourceWidth = 0, sourceHeight = 0;
    return {
      kind:"Canvas 2D fallback",
      setTexture(source) {
        const c = document.createElement("canvas");c.width=source.width;c.height=source.height;
        const ctx = c.getContext("2d", {willReadFrequently:true});ctx.drawImage(source,0,0);
        pixels = ctx.getImageData(0,0,c.width,c.height).data;
        sourceWidth=c.width;sourceHeight=c.height;
      },
      setRelief(){},
      draw(width, height, settings) {
        if (!pixels) return;
        if (overlay.width !== width || overlay.height !== height) {
          overlay.width=width;overlay.height=height;
        }
        const scale=Math.min(1,640/Math.max(width,height));
        buffer.width=Math.max(1,Math.round(width*scale));
        buffer.height=Math.max(1,Math.round(height*scale));
        const image = backing.createImageData(buffer.width,buffer.height);
        const out=image.data,tau=Math.PI*2,a=settings.accent||[.75,.84,.45];
        const tint=settings.tint||[1,1,1],tintStrength=settings.tintStrength||0;
        for(let y=0;y<buffer.height;y++)for(let x=0;x<buffer.width;x++){
          const px=(x+.5)/buffer.width,py=(y+.5)/buffer.height;
          let lon,lat,light=1;
          if(settings.flat){
            lat=(.5-py)*Math.PI/settings.zoom+(settings.flatLat||0);
            lon=(px-.5)*tau/settings.zoom+settings.yaw;
            if(Math.abs(lat)>Math.PI/2)continue;
          }else{
            const nx=(px-.5)*2*Math.max(width/height,1)*1.25/settings.zoom;
            const ny=(.5-py)*2*Math.max(height/width,1)*1.25/settings.zoom;
            const d=nx*nx+ny*ny;if(d>1)continue;
            const nz=Math.sqrt(1-d),ct=Math.cos(settings.pitch),st=Math.sin(settings.pitch);
            const gy=ct*ny+st*nz,gz=-st*ny+ct*nz;
            lat=Math.asin(Math.max(-1,Math.min(1,gy)));
            lon=Math.atan2(nx,gz)+settings.yaw;
            const studio=.34+.66*Math.max(0,(-.38*nx+.48*ny+nz)/Math.hypot(-.38,.48,1));
            const sun=Math.sin(lat)*Math.sin(settings.sunDecl)+
              Math.cos(lat)*Math.cos(settings.sunDecl)*Math.cos(lon-settings.sunLon);
            light=(1-settings.realism)*studio+settings.realism*(.10+.90*Math.max(0,Math.min(1,(sun+.08)/.16)));
          }
          const u=((lon/tau+.5)%1+1)%1;
          const v=Math.max(0,Math.min(1,.5-lat/Math.PI));
          const ix=Math.min(sourceWidth-1,Math.floor(u*sourceWidth));
          const iy=Math.min(sourceHeight-1,Math.floor(v*sourceHeight));
          const src=(iy*sourceWidth+ix)*4,dst=(y*buffer.width+x)*4;
          let r=pixels[src],g=pixels[src+1],b=pixels[src+2];
          if(tintStrength){
            const l=.299*r+.587*g+.114*b;
            r=r*(1-tintStrength)+l*tint[0]*tintStrength;
            g=g*(1-tintStrength)+l*tint[1]*tintStrength;
            b=b*(1-tintStrength)+l*tint[2]*tintStrength;
          }
          if(settings.tactical){
            const grid=Math.min(Math.abs((((lon+Math.PI)/(Math.PI/12))%1+1)%1-.5),
              Math.abs((((lat+Math.PI/2)/(Math.PI/12))%1+1)%1-.5))<.012?69:0;
            r=r*.46+grid*a[0];g=g*.46+grid*a[1];b=b*.46+grid*a[2];
          }
          out[dst]=r*light;out[dst+1]=g*light;out[dst+2]=b*light;
          out[dst+3]=255;
        }
        backing.putImageData(image,0,0);
        screen.clearRect(0,0,width,height);
        screen.imageSmoothingEnabled=true;
        screen.drawImage(buffer,0,0,width,height);
      },
      destroy() {overlay.remove();}
    };
  }

  async function create(canvas,onLost) {
    try {
      const gpu = await createGPU(canvas,onLost);
      if (gpu) return gpu;
    } catch (error) {console.warn("Globe GPU initialization failed; using 2D canvas",error);}
    return createCPU(canvas);
  }
  window.WFBGlobeRenderer = Object.freeze({create,createCPU});
})();
