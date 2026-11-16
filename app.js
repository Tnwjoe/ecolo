/* Aucun service de suivi ; aucune réponse enregistrée dans le navigateur. */
(() => {
  'use strict';
  const form = document.querySelector('#survey');
  const button = document.querySelector('#submit');
  const status = document.querySelector('#status');
  const config = window.SURVEY_CONFIG || {};
  let sending = false;
  let requestId = null;
  let attemptedPayload = null;
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || '') && /^sb_publishable_/.test(config.publishableKey || '');
  document.querySelector('#setup').hidden = configured;
  button.disabled = !configured;
  const exclusive = {q2:'Aucun', q7:'Aucune', q9:'Aucun obstacle'};
  function message(text) { status.textContent = text; if (text) status.focus(); }
  function payload() {
    const data = new FormData(form);
    const result = {survey_version:1};
    for (let i=1;i<=11;i++) {
      if ([2,4,7,9].includes(i)) result['q'+i] = data.getAll('q'+i);
      else if ([5,6].includes(i)) result['q'+i] = Array.from({length:i===5?3:5},(_,j)=>data.get(`q${i}_${j}`));
      else result['q'+i] = (data.get('q'+i)||'').trim() || null;
    }
    return result;
  }
  form.addEventListener('change', event => {
    const input = event.target;
    if (input.type === 'checkbox' && input.checked) {
      const group = [...form.querySelectorAll(`input[name="${input.name}"]`)];
      const none = exclusive[input.name];
      if (none) group.forEach(other => { if (other!==input && (input.value===none || other.value===none)) other.checked=false; });
      if (input.name==='q7' && group.filter(x=>x.checked).length>2) {
        input.checked=false; message('Choisis au maximum deux priorités. Décoche un choix pour le remplacer.');
      } else status.textContent='';
    }
    progress();
  });
  function progress() {
    const p=payload();
    const count=Array.from({length:11},(_,j)=>p['q'+(j+1)]).filter(v=>Array.isArray(v)?v.some(Boolean):Boolean(v)).length;
    document.querySelector('#count').textContent=`${count} / 11`;
    document.querySelector('#progress').value=count;
    document.querySelector('#characters').textContent=`${form.elements.q11.value.length} / 1 000`;
  }
  form.addEventListener('input',progress);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if(sending || !configured) return;
    const answers=attemptedPayload || payload();
    const nonempty=Object.entries(answers).some(([k,v])=>k!=='survey_version' && (Array.isArray(v)?v.some(Boolean):Boolean(v)));
    if (!nonempty) {message('Réponds à au moins une question avant d’envoyer. Tu peux laisser les autres vides.');return;}
    if(answers.q7.length>2) {message('Choisis au maximum deux priorités à la question 7.');return;}
    // Le même identifiant est réutilisé si la réception d’une tentative est incertaine.
    if(!requestId) requestId=crypto.randomUUID();
    if(!attemptedPayload) attemptedPayload={id:requestId,...answers};
    sending=true; button.disabled=true; button.textContent='Envoi en cours…';
    [...form.elements].forEach(el=>el.disabled=true);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/reponses',{
        method:'POST', headers:{apikey:config.publishableKey,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify(attemptedPayload),signal:controller.signal
      });
      let duplicate=false;
      if(response.status===409){const error=await response.json().catch(()=>({}));duplicate=error.code==='23505';}
      if(!response.ok && !duplicate) {
        if(response.status>=400 && response.status<500){attemptedPayload=null; requestId=null;}
        throw new Error('send');
      }
      form.hidden=true; document.querySelector('#setup').hidden=true;
      const success=document.querySelector('#success');success.hidden=false;success.focus();success.scrollIntoView({behavior:'smooth',block:'center'});
    } catch(error) {
      message(attemptedPayload ? 'L’envoi n’a pas pu être confirmé. Vérifie ta connexion puis réessaie : nous renverrons la même tentative pour éviter un doublon. Tes réponses restent affichées.' : 'L’enregistrement a échoué. Tes réponses sont conservées dans le formulaire. Réessaie ; si cela continue, signale le problème à l’équipe du projet.');
      // Une tentative incertaine reste figée jusqu’à sa confirmation.
      [...form.elements].forEach(el=>el.disabled=Boolean(attemptedPayload));
      button.textContent='Réessayer l’envoi';button.disabled=false;
    } finally {clearTimeout(timeout);sending=false;}
  });
})();
