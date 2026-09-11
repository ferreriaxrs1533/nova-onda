/** Demo content is intentionally separate from the real cloud database. */
export const defaults = {
  name: 'ONDA', announcement: 'Uma sele\u00e7\u00e3o para vestir o tempo.',
  hero_title: 'O essencial. Al\u00e9m do tempo.',
  hero_text: 'Cl\u00e1ssicos Ralph Lauren. Uma curadoria independente para vestir com personalidade, sem pressa.',
  whatsapp: '', email: '', instagram: '', mode: 'preparation',
  shipping: 'Condi\u00e7\u00f5es de entrega a confirmar com a loja.',
  returns: 'Pol\u00edtica de trocas em prepara\u00e7\u00e3o. Consulte a loja antes de comprar.',
  about: 'A ONDA nasce de uma ideia simples: boas escolhas atravessam esta\u00e7\u00f5es. Uma sele\u00e7\u00e3o independente de pe\u00e7as cl\u00e1ssicas, texturas e detalhes para o seu dia a dia.'
};
export const categories = [{id:'polos',name:'Polos'},{id:'camisas',name:'Camisas'},{id:'tricos',name:'Tric\u00f4s'},{id:'calcas',name:'Cal\u00e7as'}];
const seeds = [
  ['polo-pima','Polo em algod\u00e3o pima','polos',42900,'Marinho','photo-1625910513413-5fc421e0b8f0'],
  ['camisa-oxford','Camisa Oxford cl\u00e1ssica','camisas',58900,'Azul','photo-1596755094514-f87e34085b2c'],
  ['trico-essencial','Tric\u00f4 de meia-esta\u00e7\u00e3o','tricos',74900,'Areia','photo-1614495039151-e50f8c0e8f30'],
  ['calca-chino','Cal\u00e7a chino reta','calcas',64900,'Bege','photo-1473966968600-fa801b869a1a'],
  ['polo-marinho','Polo piqu\u00e9 de ver\u00e3o','polos',45900,'Marinho','photo-1625910513413-5fc421e0b8f0'],
  ['camisa-linho','Camisa de linho leve','camisas',69900,'Branco','photo-1598033129183-c4f50c736f10']
];
export const demos = seeds.map(([slug,name,category_id,price_cents,color,photo]) => ({
  id:`demo-${slug}`,slug,name,brand:'Ralph Lauren',category_id,price_cents,compare_cents:null,status:'published',featured:true,is_demo:true,
  description:'Exemplo de cadastro. Imagem ilustrativa; nao representa um produto real a venda.',composition:'Preencher os dados da peca real.',measurements:'Cadastre as medidas da peca real.',
  images:[`https://images.unsplash.com/${photo}?auto=format&fit=crop&w=900&q=85`],
  variants:[{id:`demo-${slug}-m`,product_id:`demo-${slug}`,sku:`DEMO-${slug}`,size:'M',color,stock:0}],
  created_at:'2026-09-11T00:00:00Z',updated_at:'2026-09-11T00:00:00Z'
}));
export function demoCatalog(configured = false) { return { products:structuredClone(demos), categories:structuredClone(categories), settings:{...defaults}, configured }; }
