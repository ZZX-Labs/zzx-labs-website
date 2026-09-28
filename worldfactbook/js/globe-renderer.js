/* WebGPU globe; Canvas 2D is the available fallback. No WebGL or tile service. */
(function () {
  "use strict";
  const SHADER = `
    struct Globe {
      camera: vec4f,       // aspect, longitude, pitch, roll
      controls: vec4f,     // zoom, grid enabled, subsolar longitude, declination
      light: vec4f,        // realism, grid red, grid green, grid blue
    };
    @group(0) @binding(0) var<uniform> globe: Globe;
    @group(0) @binding(1) var image: texture_2d<f32>;
    @group(0) @binding(2) var imageSampler: sampler;
    struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
    @vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
      let corners = array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
      let p = corners[i];
      var result: Vertex;
      result.position = vec4f(p,0.0,1.0);
      result.uv = vec2f((p.x+1.0)*0.5,(1.0-p.y)*0.5);
      return result;
    }
    @fragment fn fragment(input: Vertex) -> @location(0) vec4f {
      let pi = 3.141592653589793;
      let xy = vec2f((input.uv.x-0.5)*2.0*max(globe.camera.x,1.0),
                     (0.5-input.uv.y)*2.0*max(1.0/globe.camera.x,1.0)) * 1.25/globe.controls.x;
      let radius2 = dot(xy,xy);
      if(radius2 > 1.0){discard;}
      let front = sqrt(max(0.0,1.0-radius2));
      let cr = cos(globe.camera.w);
      let sr = sin(globe.camera.w);
      let xp = xy.x*cr+xy.y*sr;
      let yp = -xy.x*sr+xy.y*cr;
      let cp = cos(globe.camera.z);
      let sp = sin(globe.camera.z);
      let north = yp*cp+front*sp;
      let toward = -yp*sp+front*cp;
      let latitude = asin(clamp(north,-1.0,1.0));
      let longitude = atan2(xp,toward)+globe.camera.y;
      let uv = vec2f(fract(longitude/(2.0*pi)+0.5),0.5-latitude/pi);
      var color = textureSample(image,imageSampler,uv).rgb;
      if(globe.controls.y > 0.5){
        let a = abs(fract((longitude+pi)/(pi/12.0))-0.5);
        let b = abs(fract((latitude+pi*0.5)/(pi/12.0))-0.5);
        let grid = (1.0-step(0.015,min(a,b))) * 0.34;
        color = color*0.57+globe.light.yzw*grid;
      }
      let studio = 0.34+0.66*max(0.0,dot(vec3f(xy,front),normalize(vec3f(-0.38,0.48,1.0))));
      let sun = vec3f(sin(globe.controls.z)*cos(globe.controls.w),sin(globe.controls.w),
                      cos(globe.controls.z)*cos(globe.controls.w));
      let normal = vec3f(sin(longitude)*cos(latitude),sin(latitude),cos(longitude)*cos(latitude));
      let solar = clamp(0.09+0.91*smoothstep(-0.12,0.25,dot(sun,normal)),0.08,1.0);
      let level = mix(studio,solar,globe.light.x);
      let rim = smoothstep(0.02,0.33,front);
      return vec4f(color*level + vec3f(0.03,0.065,0.07)*(1.0-rim),1.0);
    }`;
  const params = (width,height,c) => new Float32Array([
    width/height,c.yaw,c.pitch,c.roll,c.zoom,Number(c.tactical),c.solarLon,c.solarDecl,
    c.realism,c.grid[0],c.grid[1],c.grid[2]
  ]);
  async function createGPU(canvas,onLost){
    if(!navigator.gpu || !window.isSecureContext)return null;
    const adapter = await navigator.gpu.requestAdapter({powerPreference:"high-performance"}) ||
      await navigator.gpu.requestAdapter();
    if(!adapter)return null;
    const device=await adapter.requestDevice();
    const context=canvas.getContext("webgpu");
    if(!context)return null;
    const format=navigator.gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:"premultiplied"});
    const module=device.createShaderModule({code:SHADER});
    const info=await module.getCompilationInfo();
    const fault=info.messages.find(message=>message.type==="error");
    if(fault)throw Error(`Globe shader: ${fault.message}`);
    const pipeline=device.createRenderPipeline({layout:"auto",vertex:{module,entryPoint:"vertex"},
      fragment:{module,entryPoint:"fragment",targets:[{format}]},primitive:{topology:"triangle-list"}});
    const uniform=device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const sampler=device.createSampler({addressModeU:"repeat",addressModeV:"clamp-to-edge",
      magFilter:"linear",minFilter:"linear"});
    let texture=null,group=null,destroyed=false;
    device.lost.then(()=>{if(!destroyed)onLost();});
    return {kind:"WebGPU",setTexture(source){
      const next=device.createTexture({size:[source.width,source.height,1],format:"rgba8unorm",
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
      try{
        device.queue.copyExternalImageToTexture({source},{texture:next},[source.width,source.height]);
        const binding=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:uniform}},{binding:1,resource:next.createView()},
          {binding:2,resource:sampler}]});
        texture?.destroy();texture=next;group=binding;
      }catch(error){next.destroy();throw error;}
    },draw(width,height,c){
      if(!group)return;
      device.queue.writeBuffer(uniform,0,params(width,height,c));
      const encoder=device.createCommandEncoder();
      const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),
        clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});
      pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();
      device.queue.submit([encoder.finish()]);
    },destroy(){destroyed=true;texture?.destroy();uniform.destroy();context.unconfigure();}};
  }
  function createCPU(canvas){
    const overlay=document.createElement("canvas");overlay.className="wfb-globe-cpu";
    overlay.setAttribute("aria-hidden","true");canvas.after(overlay);
    const screen=overlay.getContext("2d",{alpha:true});
    const buffer=document.createElement("canvas"),backing=buffer.getContext("2d",{willReadFrequently:true});
    let pixels=null,sourceWidth=0,sourceHeight=0,lookup=[],key="",lastDraw=0;
    function geometry(width,height,zoom){
      const scale=Math.min(1,440/Math.max(width,height));
      const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
      if(key===`${w}:${h}:${zoom}`)return;
      key=`${w}:${h}:${zoom}`;buffer.width=w;buffer.height=h;lookup=new Array(w*h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const nx=(((x+.5)/w)-.5)*2*Math.max(w/h,1)*1.25/zoom;
        const ny=(.5-(y+.5)/h)*2*Math.max(h/w,1)*1.25/zoom;
        if(nx*nx+ny*ny>1)continue;
        const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
        lookup[y*w+x]={nx,ny,nz,studio:.34+.66*Math.max(0,(-.38*nx+.48*ny+nz)/Math.hypot(-.38,.48,1))};
      }
    }
    return {kind:"Canvas 2D fallback",setTexture(source){
      const c=document.createElement("canvas");c.width=source.width;c.height=source.height;
      const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(source,0,0);
      pixels=ctx.getImageData(0,0,c.width,c.height).data;
      sourceWidth=c.width;sourceHeight=c.height;lastDraw=0;
    },draw(width,height,c){
      if(!pixels)return;
      const now=performance.now();if(now-lastDraw<65)return;lastDraw=now;
      if(overlay.width!==width||overlay.height!==height){overlay.width=width;overlay.height=height;key="";}
      geometry(width,height,c.zoom);
      const image=backing.createImageData(buffer.width,buffer.height),out=image.data;
      const sr=Math.sin(c.roll),cr=Math.cos(c.roll),sp=Math.sin(c.pitch),cp=Math.cos(c.pitch);
      const sd=Math.sin(c.solarDecl),cd=Math.cos(c.solarDecl);
      for(let i=0;i<lookup.length;i++){
        const p=lookup[i];if(!p)continue;
        const xx=p.nx*cr+p.ny*sr,yy=-p.nx*sr+p.ny*cr;
        const north=yy*cp+p.nz*sp,toward=-yy*sp+p.nz*cp;
        const lat=Math.asin(Math.max(-1,Math.min(1,north)));
        const lon=Math.atan2(xx,toward)+c.yaw;
        const u=((lon/(2*Math.PI)+.5)%1+1)%1;
        const ix=Math.min(sourceWidth-1,Math.floor(u*sourceWidth));
        const iy=Math.min(sourceHeight-1,Math.max(0,Math.floor((.5-lat/Math.PI)*sourceHeight)));
        const src=(iy*sourceWidth+ix)*4,dst=i*4;
        const solarDot=Math.cos(lat)*cd*Math.cos(lon-c.solarLon)+Math.sin(lat)*sd;
        const t=Math.max(0,Math.min(1,(solarDot+.12)/.37));
        const sm=t*t*(3-2*t);
        const light=p.studio*(1-c.realism)+c.realism*(.09+.91*sm);
        const grid=c.tactical&&Math.min(
          Math.abs(((lon+Math.PI)/(Math.PI/12)%1+1)%1-.5),
          Math.abs(((lat+Math.PI/2)/(Math.PI/12)%1+1)%1-.5))<.015?.34:0;
        const mix=c.tactical?.57:1;
        out[dst]=Math.min(255,(pixels[src]*mix+255*c.grid[0]*grid)*light+7*(1-p.nz));
        out[dst+1]=Math.min(255,(pixels[src+1]*mix+255*c.grid[1]*grid)*light+16*(1-p.nz));
        out[dst+2]=Math.min(255,(pixels[src+2]*mix+255*c.grid[2]*grid)*light+18*(1-p.nz));
        out[dst+3]=255;
      }
      backing.putImageData(image,0,0);
      screen.clearRect(0,0,width,height);screen.imageSmoothingEnabled=true;
      screen.drawImage(buffer,0,0,width,height);
    },destroy(){overlay.remove();}};
  }
  async function create(canvas,onLost){
    try{const gpu=await createGPU(canvas,onLost);if(gpu)return gpu;}
    catch(error){console.warn("WebGPU unavailable; using Canvas 2D",error);}
    return createCPU(canvas);
  }
  window.WFBGlobeRenderer=Object.freeze({create,createCPU});
})();
