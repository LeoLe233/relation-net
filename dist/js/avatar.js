import {escapeHtml as e,validateAvatar,MAX_AVATAR_LENGTH} from './model.js';
import {t} from './i18n.js';

export const avatarContent=p=>`${e([...String(p.name||'')][0]||'?')}${p.avatar?`<img class="avatar-image" src="${e(p.avatar)}" alt="" draggable="false">`:''}`;

// Coordinates are kept in source-image pixels, independent of screen size.
export function cropBounds(width,height,zoom=1,cx=width/2,cy=height/2){
  const size=Math.min(width,height)/Math.max(1,Math.min(4,zoom));
  return {x:Math.max(0,Math.min(width-size,cx-size/2)),y:Math.max(0,Math.min(height-size,cy-size/2)),size};
}

export function avatarEditorMarkup(p={}){
  return `<section class="avatar-editor" aria-label="${t('角色头像')}"><div class="avatar-editor-row"><div class="avatar-preview" data-avatar-preview style="background:${p.color||'#708f87'}">${avatarContent(p)}</div><div class="avatar-editor-controls"><div class="avatar-label">${t('角色头像')}</div><div class="avatar-actions"><button type="button" class="button secondary" data-avatar-upload>${t('上传头像')}</button><button type="button" class="button quiet" data-avatar-remove ${p.avatar?'':'hidden'}>${t('移除头像')}</button></div><p class="avatar-hint">${t('未上传时显示姓名的首字母或首个汉字。')}</p><p class="avatar-hint">${t('PNG、JPG、WebP 或 GIF，最大 10 MB。')}</p></div></div><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-avatar-file hidden><div class="avatar-crop" data-avatar-crop hidden><h3>${t('裁剪头像')}</h3><p id="avatar-crop-help" class="avatar-hint">${t('拖动图片选择区域，调整缩放；也可用方向键移动。')}</p><p data-avatar-loading role="status" hidden>${t('正在读取图片…')}</p><canvas data-avatar-canvas width="320" height="320" tabindex="0" role="img" aria-label="${t('头像裁剪区域')}" aria-describedby="avatar-crop-help"></canvas><label class="avatar-zoom">${t('缩放')}<input data-avatar-zoom type="range" min="1" max="4" step="0.01" value="1"><output data-avatar-zoom-label>1.00×</output></label><div class="avatar-actions"><button type="button" class="button secondary" data-avatar-cancel>${t('取消裁剪')}</button><button type="button" class="button primary" data-avatar-apply>${t('使用此头像')}</button></div></div><p class="form-error avatar-error" data-avatar-error role="alert" hidden></p></section>`;
}

export function wireAvatarEditor(form,p={}){
  const $=q=>form.querySelector(q),pick=$('[data-avatar-file]'),panel=$('[data-avatar-crop]'),canvas=$('[data-avatar-canvas]'),slider=$('[data-avatar-zoom]');
  const upload=$('[data-avatar-upload]'),remove=$('[data-avatar-remove]'),apply=$('[data-avatar-apply]'),save=form.querySelector('[type="submit"]');
  let value=p.avatar,source=null,objectURL=null,request=0,active=true,pending=false,crop=null,drag=null;
  const release=()=>{if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}source=null;drag=null;};
  const error=message=>{const node=$('[data-avatar-error]');node.textContent=message;node.hidden=!message;};
  const refresh=()=>{
    const preview=$('[data-avatar-preview]');preview.innerHTML=avatarContent({name:$('[name="name"]').value,avatar:value});
    preview.style.background=$('[name="color"]:checked')?.value||p.color||'#708f87';remove.hidden=!value;
  };
  const setPending=flag=>{pending=flag;save.disabled=flag;remove.disabled=flag;};
  const draw=(zoom=Number(slider.value),cx,cy)=>{
    if(!source)return;
    crop=cropBounds(source.naturalWidth,source.naturalHeight,zoom,cx??(crop?crop.x+crop.size/2:source.naturalWidth/2),cy??(crop?crop.y+crop.size/2:source.naturalHeight/2));
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,320,320);ctx.drawImage(source,crop.x,crop.y,crop.size,crop.size,0,0,320,320);
    ctx.strokeStyle='#ffffff80';ctx.lineWidth=1;
    for(const at of [320/3,640/3]){ctx.beginPath();ctx.moveTo(at,0);ctx.lineTo(at,320);ctx.moveTo(0,at);ctx.lineTo(320,at);ctx.stroke();}
    $('[data-avatar-zoom-label]').textContent=Number(slider.value).toFixed(2)+'×';
  };
  const cancel=()=>{request++;release();setPending(false);panel.hidden=true;error('');upload.focus();};
  upload.addEventListener('click',()=>pick.click());
  remove.addEventListener('click',()=>{value=undefined;error('');refresh();upload.focus();});
  $('[name="name"]').addEventListener('input',refresh);
  form.addEventListener('change',event=>{if(event.target.name==='color')refresh();});
  pick.addEventListener('change',async()=>{
    const file=pick.files?.[0];pick.value='';if(!file)return;
    request++;const current=request;release();setPending(false);panel.hidden=true;error('');
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){error(t('请选择 PNG、JPG、WebP 或 GIF 图片。'));return;}
    if(file.size>10*1024*1024){error(t('图片超过 10 MB，请选择较小的图片。'));return;}
    setPending(true);panel.hidden=false;canvas.hidden=true;slider.disabled=true;apply.disabled=true;$('[data-avatar-loading]').hidden=false;
    objectURL=URL.createObjectURL(file);const img=new Image();img.src=objectURL;
    try{
      await img.decode();if(!active||current!==request||form.isConnected===false)return;
      if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('size');
      source=img;slider.value='1';crop=null;draw(1,img.naturalWidth/2,img.naturalHeight/2);
      canvas.hidden=false;slider.disabled=false;apply.disabled=false;$('[data-avatar-loading]').hidden=true;canvas.focus();
    }catch{
      if(!active||current!==request)return;
      release();setPending(false);panel.hidden=true;error(t('无法读取图片，或图片像素过大。请换一张不超过 4000 万像素的图片。'));
    }
  });
  slider.addEventListener('input',()=>draw());
  canvas.addEventListener('pointerdown',event=>{
    if(!source||drag||(event.pointerType==='mouse'&&event.button!==0))return;
    event.preventDefault();canvas.focus();canvas.setPointerCapture(event.pointerId);
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,cx:crop.x+crop.size/2,cy:crop.y+crop.size/2,size:crop.size};
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const scale=drag.size/canvas.getBoundingClientRect().width;
    draw(Number(slider.value),drag.cx-(event.clientX-drag.x)*scale,drag.cy-(event.clientY-drag.y)*scale);
  });
  const end=event=>{if(drag?.id!==event.pointerId)return;drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[1,0],ArrowRight:[-1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];if(!delta||!source)return;
    event.preventDefault();const step=crop.size*(event.shiftKey ? .1 : .02);draw(Number(slider.value),crop.x+crop.size/2+delta[0]*step,crop.y+crop.size/2+delta[1]*step);
  });
  $('[data-avatar-cancel]').addEventListener('click',cancel);
  apply.addEventListener('click',()=>{
    if(!source)return;
    try{
      const result=document.createElement('canvas');result.width=result.height=256;
      const ctx=result.getContext('2d');ctx.drawImage(source,crop.x,crop.y,crop.size,crop.size,0,0,256,256);
      let encoded=result.toDataURL('image/webp',.82);
      if(encoded.length>MAX_AVATAR_LENGTH){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);encoded=result.toDataURL('image/jpeg',.72);}
      value=validateAvatar(encoded);cancel();refresh();
    }catch{error(t('无法生成头像，请换一张图片重试。'));}
  });
  return {get value(){return value;},get pending(){return pending;},destroy(){active=false;request++;release();}};
}
