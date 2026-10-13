(() => {
 function revealEvidenceAnchor(){
  let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
  const target=id&&document.getElementById(id);if(!target)return;
  for(let ancestor=target.parentElement;ancestor;ancestor=ancestor.parentElement)if(ancestor.tagName==='DETAILS')ancestor.open=true;
  requestAnimationFrame(()=>target.scrollIntoView());
 }
 addEventListener('hashchange',revealEvidenceAnchor);revealEvidenceAnchor();
})();
