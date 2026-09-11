export const esc = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const icon = (name,size=20) => {
 const paths={bag:'<path d="M6 7h12l1 14H5L6 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 5 9-5M12 12v9M7 5l10 5"/>'};
 return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
};
export async function api(url,options={}) {
 const response=await fetch(url,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 let data; try{data=await response.json();}catch{throw new Error('Resposta invalida do servidor. Confira a configuracao de publicacao na Vercel.');} if(!response.ok) throw new Error(data.error||'Nao foi possivel concluir.'); return data;
}
export function toast(message,error=false) {
 const box=document.getElementById('toast'); box.textContent=message; box.className=`toast visible${error?' error':''}`;
 clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>box.className='toast',5000);
}
export function cents(value) {
 const cleaned=String(value).trim().replace(/\s/g,'').replace('R$','');
 const normalized=cleaned.includes(',')?cleaned.replace(/\./g,'').replace(',','.'):cleaned;
 if(!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Informe o preco no formato 429,90.');
 const [whole,fraction='']=normalized.split('.'); return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export function img(src,alt,extra='') { return `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" ${extra}>`; }
// External editorial photos may be unavailable offline. Never leave a broken-image layout.
document.addEventListener('error',event=>{
 const image=event.target;
 if(image instanceof HTMLImageElement && image.src.startsWith('https://images.unsplash.com/')) {
   const label=(image.alt+' '+(image.closest('.product-card')?.textContent||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const file=label.includes('camisa')?'/camisa.svg':label.includes('trico')?'/trico.svg':label.includes('calca')?'/calca.svg':'/placeholder.svg';
   image.src=image.closest('.hero-visual,.manifesto-image')?'/editorial.svg':file;
   image.alt='Composi\u00e7\u00e3o ilustrativa de roupa. N\u00e3o representa produto real.';
 }
},true);
