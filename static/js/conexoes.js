/* EasyIntern 2.0 — protótipo sem API. Nenhum dado salvo no servidor. */
(() => {
  'use strict';
  const students = [
    {id:1,name:'Ana Souza',course:'Desenvolvimento de Sistemas',institution:'ETEC Jardim Ângela',area:'desenvolvimento',skills:['Python','MySQL','Git'],about:'Estudante de desenvolvimento de sistemas, interessada em back-end e projetos colaborativos.',city:'São Paulo, SP',avatar:'#7134db'},
    {id:2,name:'Carlos Mendes',course:'Ciência da Computação',institution:'Universidade de São Paulo',area:'desenvolvimento',skills:['Java','Spring','SQL'],about:'Desenvolvedor em formação, com interesse em APIs e arquitetura de software.',city:'São Paulo, SP',avatar:'#3478cf'},
    {id:3,name:'Beatriz Lima',course:'Design de Interfaces',institution:'Faculdade de Tecnologia',area:'design',skills:['Figma','UI/UX','React'],about:'Apaixonada por interfaces acessíveis e experiências digitais intuitivas.',city:'Osasco, SP',avatar:'#cf538e'},
    {id:4,name:'Lucas Ferreira',course:'Análise e Desenvolvimento de Sistemas',institution:'ETEC',area:'dados',skills:['Python','Pandas','Power BI'],about:'Gosto de analisar dados e transformar informações em soluções úteis.',city:'São Paulo, SP',avatar:'#299587'},
    {id:5,name:'Mariana Costa',course:'Engenharia de Software',institution:'Universidade Federal',area:'desenvolvimento',skills:['JavaScript','Node.js','TypeScript'],about:'Construindo soluções web e aprendendo novas tecnologias a cada projeto.',city:'Santo André, SP',avatar:'#9853cc'},
    {id:6,name:'Rafael Oliveira',course:'Design Digital',institution:'Centro Universitário',area:'design',skills:['Figma','HTML','CSS'],about:'Criando experiências digitais inclusivas para pessoas e comunidades.',city:'São Bernardo, SP',avatar:'#e09b42'}
  ];
  const $ = id => document.getElementById(id);
  const saved = new Set();
  let tab = 'discover';
  let theme = 'dark';
  const initials = name => name.split(' ').slice(0,2).map(n=>n[0]).join('');
  const el = (tag,klass,text) => {const e=document.createElement(tag);if(klass)e.className=klass;if(text)e.textContent=text;return e;};
  const toast = message => {const t=$('toast');t.textContent=message;t.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('visible'),2500);};
  const profile = person => {
    const root=$('dialogContent');root.replaceChildren();
    const avatar=el('div','avatar',initials(person.name));avatar.style.setProperty('--avatar',person.avatar);root.append(avatar);
    root.append(el('h2','',person.name),el('p','',person.course+' · '+person.institution),el('p','',person.about),el('p','',person.city));
    const tags=el('div','tags');person.skills.forEach(skill=>tags.append(el('span','tag',skill)));root.append(tags);
    root.append(el('p','', 'Este perfil é fictício e demonstra como será a visualização pública. Dados pessoais sensíveis não são exibidos.'));
    $('profileDialog').showModal();
  };
  const card = person => {
    const article=el('article','person');
    const head=el('div','person-head');
    const avatar=el('div','avatar',initials(person.name));avatar.style.setProperty('--avatar',person.avatar);
    const identity=el('div');identity.append(el('h3','',person.name),el('div','course',person.course));head.append(avatar,identity);
    const info=el('p','about',person.about);
    const tags=el('div','tags');person.skills.forEach(s=>tags.append(el('span','tag',s)));
    const meta=el('div','meta','⌖ '+person.city+' · '+person.institution);
    const actions=el('div','actions');
    const view=el('button','primary','Ver perfil');view.type='button';view.addEventListener('click',()=>profile(person));
    const save=el('button','outline'+(saved.has(person.id)?' saved':''),saved.has(person.id)?'★ Salvo':'☆ Salvar');save.type='button';save.setAttribute('aria-pressed',String(saved.has(person.id)));save.addEventListener('click',()=>{if(saved.has(person.id)){saved.delete(person.id);toast('Perfil removido dos salvos.');}else{saved.add(person.id);toast('Perfil salvo nesta sessão.');}render();});
    actions.append(view,save);article.append(head,info,tags,meta,actions);return article;
  };
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function render(){
    const q=normalize($('searchPeople').value.trim()),area=$('areaFilter').value;
    const filtered=students.filter(p=>(tab!=='saved'||saved.has(p.id))&&(!area||area===p.area)&&(!q||normalize([p.name,p.course,p.institution,p.city,...p.skills].join(' ')).includes(q)));
    $('peopleGrid').replaceChildren(...filtered.map(card));$('emptyState').hidden=filtered.length!==0;
    $('resultCount').textContent=filtered.length+' '+(filtered.length===1?'perfil':'perfis');$('savedCount').textContent=String(saved.size);
  }
  $('searchPeople').addEventListener('input',render);$('areaFilter').addEventListener('change',render);
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.tab;document.querySelectorAll('[data-tab]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});render();}));
  $('themeToggle').addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;$('themeToggle').innerHTML=theme==='dark'?'☀️ <span>Modo claro</span>':'🌙 <span>Modo escuro</span>';});
  $('closeDialog').addEventListener('click',()=>$('profileDialog').close());$('profileDialog').addEventListener('click',e=>{if(e.target===$('profileDialog'))$('profileDialog').close();});
  render();
})();
