import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectSentenceRetakes,detectUnfinishedSentences} from '../services/aiEditor.js';
import type {Word} from '../types.js';
function sentences(...parts:string[]):Word[]{let time=0;return parts.flatMap((text,i)=>{if(i)time+=1.2;return text.split(' ').map(word=>{const start=time;time+=.3;return {word,start,end:time}})})}
test('preserves affirmation followed by negation, not an interchangeable retake',()=>{assert.deepEqual(detectSentenceRetakes(sentences('המוצר הזה עוזר מאוד ללקוחות','המוצר הזה לא עוזר מאוד ללקוחות')),[])});
test('preserves changed numbers instead of discarding a different factual claim',()=>{assert.deepEqual(detectSentenceRetakes(sentences('המוצר הזה עולה 100 שקלים ללקוחות','המוצר הזה עולה 200 שקלים ללקוחות')),[])});
test('preserves complete short phrase before a long speech pause',()=>{assert.deepEqual(detectUnfinishedSentences(sentences('זה חשוב מאוד','עכשיו נעבור לנושא אחר')),[])});
test('preserves complete negative answer before a fresh sentence',()=>{assert.deepEqual(detectUnfinishedSentences(sentences('ממש לא','עכשיו נדבר על הנושא הבא')),[])});
test('preserves clean public-read phrase previously flagged only for its length',()=>{assert.deepEqual(detectUnfinishedSentences(sentences('ולא לשליט אחד','הכוח נמצא בידי העם כולו')),[])});
test('still recognizes exact extended retake and filler-only false start',()=>{assert.equal(detectSentenceRetakes(sentences('המוצר הזה עוזר מאוד','המוצר הזה עוזר מאוד ללקוחות')).length,1);assert.equal(detectUnfinishedSentences(sentences('אז בעצם','בואו נתחיל מהבסיס')).length,1)});
