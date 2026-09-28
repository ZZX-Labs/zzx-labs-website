/* One renderer for the public Factbook globe. WebGPU is preferred; Canvas 2D
   preserves the map and country controls when a browser has no WebGPU device. */
(function () {
  "use strict";

  const SHADER = `
    struct Globe { aspect: f32, yaw: f32, mercator: f32, tactical: f32 };
    @group(0) @binding(0) var<uniform> globe: Globe;
    @group(0) @binding(1) var image: texture_2d<f32>;
    @group(0) @binding(2) var imageSampler: sampler;
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
                     (0.5 - input.uv.y) * 2.0 * max(1.0 / globe.aspect, 1.0)) * 1.25;
      let radius2 = dot(xy, xy);
      let normal = vec3f(xy, sqrt(max(0.0, 1.0 - radius2)));
      let latitude = asin(clamp(normal.y, -1.0, 1.0));
      let longitude = atan2(normal.x, normal.z) + globe.yaw;
      let u = fract(longitude / (2.0 * pi) + 0.5);
      var v = 0.5 - latitude / pi;
      if (globe.mercator > 0.5) {
        v = clamp(0.5 - log(tan(pi * 0.25 + latitude * 0.5)) / (2.0 * pi), 0.0, 1.0);
      }
      var color = textureSample(image, imageSampler, vec2f(u, v)).rgb;
      if (radius2 > 1.0) { discard; }
      if (globe.tactical > 0.5) {
        let a = abs(fract((longitude + pi) / (pi / 12.0)) - 0.5);
        let b = abs(fract((latitude + pi * 0.5) / (pi / 12.0)) - 0.5);
        let grid = (1.0 - step(0.015, min(a, b))) * 0.24;
        color = color * 0.48 + vec3f(grid * 0.35, grid, grid * 0.5);
      }
      let light = 0.34 + 0.66 * max(0.0, dot(normal, normalize(vec3f(-0.38, 0.48, 1.0))));
      let rim = smoothstep(0.02, 0.33, normal.z);
      return vec4f(color * light + vec3f(0.03, 0.09, 0.12) * (1.0 - rim), 1.0);
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
    const pipeline = device.createRenderPipeline({
      layout:"auto",
      vertex:{module, entryPoint:"vertex"},
      fragment:{module, entryPoint:"fragment", targets:[{format}]},
      primitive:{topology:"triangle-list"}
    });
    const uniform = device.createBuffer({size:16, usage:GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    const sampler = device.createSampler({addressModeU:"repeat", addressModeV:"clamp-to-edge",
      magFilter:"linear", minFilter:"linear"});
    let texture = null, bindGroup = null, destroyed = false;
    device.lost.then(() => {if (!destroyed) onLost();});
    return {
      kind:"WebGPU",
      setTexture(source) {
        const next = device.createTexture({size:[source.width, source.height, 1],
          format:"rgba8unorm", usage:GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT});
        try {
          device.queue.copyExternalImageToTexture({source}, {texture:next},
            [source.width, source.height]);
          const group = device.createBindGroup({layout:pipeline.getBindGroupLayout(0), entries:[
            {binding:0, resource:{buffer:uniform}}, {binding:1, resource:next.createView()},
            {binding:2, resource:sampler}
          ]});
          texture?.destroy(); texture = next; bindGroup = group;
        } catch (error) {next.destroy(); throw error;}
      },
      draw(width, height, yaw, mercator, tactical) {
        if (!bindGroup) return;
        device.queue.writeBuffer(uniform, 0,
          new Float32Array([width / height, yaw, Number(mercator), Number(tactical)]));
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({colorAttachments:[{
          view:context.getCurrentTexture().createView(),
          clearValue:{r:0,g:0,b:0,a:0}, loadOp:"clear", storeOp:"store"
        }]});
        pass.setPipeline(pipeline);pass.setBindGroup(0, bindGroup);pass.draw(3);pass.end();
        device.queue.submit([encoder.finish()]);
      },
      destroy() {destroyed = true; texture?.destroy(); uniform.destroy(); context.unconfigure();}
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
    let pixels = null, sourceWidth = 0, sourceHeight = 0, lookup = null;
    let lookupKey = "", lastDraw = 0;
    function geometry(width, height, mercator) {
      const scale = Math.min(1, 440 / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const key = `${w}:${h}:${mercator}`;
      if (lookupKey === key) return;
      buffer.width = w;buffer.height = h;
      lookupKey = key;
      lookup = new Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const nx = (((x + .5) / w) - .5) * 2 * Math.max(w / h, 1) * 1.25;
        const ny = (.5 - (y + .5) / h) * 2 * Math.max(h / w, 1) * 1.25;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d), lat = Math.asin(ny);
        const v = mercator ? Math.max(0, Math.min(1,
          .5 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI))) : .5 - lat / Math.PI;
        const light = .34 + .66 * Math.max(0,(-.38*nx+.48*ny+nz)/Math.hypot(-.38,.48,1));
        lookup[y*w+x] = {lon:Math.atan2(nx,nz), lat, v, light, rim:Math.min(1,Math.max(0,nz/.33))};
      }
    }
    return {
      kind:"Canvas 2D fallback",
      setTexture(source) {
        const c = document.createElement("canvas");c.width=source.width;c.height=source.height;
        const ctx = c.getContext("2d", {willReadFrequently:true});ctx.drawImage(source,0,0);
        pixels = ctx.getImageData(0,0,c.width,c.height).data;
        sourceWidth=c.width;sourceHeight=c.height;lastDraw=0;
      },
      draw(width, height, yaw, mercator, tactical) {
        if (!pixels) return;
        const now = performance.now();
        if (now - lastDraw < 65) return;
        lastDraw = now;
        if (overlay.width !== width || overlay.height !== height) {
          overlay.width=width;overlay.height=height;lookupKey="";
        }
        geometry(width,height,mercator);
        const image = backing.createImageData(buffer.width,buffer.height);
        const out = image.data, tau = Math.PI * 2;
        for (let i=0; i<lookup.length; i++) {
          const p=lookup[i];if (!p) continue;
          const lon=p.lon+yaw;
          const u=((lon/tau+.5)%1+1)%1;
          const ix=Math.min(sourceWidth-1,Math.floor(u*sourceWidth));
          const iy=Math.min(sourceHeight-1,Math.max(0,Math.floor(p.v*sourceHeight)));
          const src=(iy*sourceWidth+ix)*4, dst=i*4;
          let r=pixels[src],g=pixels[src+1],b=pixels[src+2];
          if(tactical){
            const grid=Math.min(Math.abs(((lon+Math.PI)/(Math.PI/12)%1+1)%1-.5),
              Math.abs(((p.lat+Math.PI/2)/(Math.PI/12)%1+1)%1-.5))<.015?61:0;
            r=r*.48+grid*.35;g=g*.48+grid;b=b*.48+grid*.5;
          }
          out[dst]=r*p.light+7.65*(1-p.rim);
          out[dst+1]=g*p.light+22.95*(1-p.rim);
          out[dst+2]=b*p.light+30.6*(1-p.rim);
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
