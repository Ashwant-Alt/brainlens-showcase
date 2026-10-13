export function checkNotes(notes){
 const issues=[];
 if(!/uncertain|limitation|unassessed|cannot|may|candidate|not a diagnosis|not diagnostic/i.test(notes))issues.push('Consider describing uncertainty and limitations.');
 if(/\b(perfect|100% accurate|definitely|guaranteed|healthy brain|no disease)\b/i.test(notes))issues.push('Review wording that implies certainty or excludes all disease.');
 if(/\b(diagnosed|diagnosis confirmed|AI confirms|model confirms)\b/i.test(notes))issues.push('Review any diagnosis attributed to the model.');
 return issues.length?issues:['No configured wording rules were triggered. This does not establish medical correctness.'];
}
