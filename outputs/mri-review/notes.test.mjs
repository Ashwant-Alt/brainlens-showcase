import {test} from 'node:test';import assert from 'node:assert/strict';import {checkNotes} from './notes.mjs';
test('flags unwarranted certainty and absent limitations',()=>{const result=checkNotes('The model confirms a healthy brain.');assert.equal(result.length,3);});
test('clear caveats do not imply correctness',()=>{assert.match(checkNotes('Candidate regions are uncertain and other conditions are unassessed.')[0],/does not establish medical correctness/);});
