import test from 'node:test';
import assert from 'node:assert/strict';
import {fryShareUrl} from '../src/features/EggFry/links.ts';
import {parseFryCode} from '../src/features/EggFry/rules.ts';

test('shared Fry runs always lead to a public page and retain their seed in both languages',()=>{
  for(const lang of ['ru','en'])for(const seed of [0,1,123,0xffffffff]){
    const url=fryShareUrl(lang,seed,'https://egg.ilyamedve.dev');
    assert.equal(url.origin,'https://egg.ilyamedve.dev');
    assert.equal(url.pathname,`/${lang}/fry/`);
    assert.equal(parseFryCode(url.searchParams.get('fry')),seed);
    assert.deepEqual([...url.searchParams.keys()],['fry']);
  }
});
