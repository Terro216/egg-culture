import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as oldProfile } from '../src/pages/[lang]/players/[id].ts';
import { GET as oldGames } from '../src/pages/[lang]/dark-side/games.ts';

test('old profile URLs redirect to adepts without losing the profile ID', () => {
  const url = new URL('https://egg.example/ru/players/ilyamed/');
  const response = oldProfile({ params: { lang: 'ru', id: 'ilyamed' }, url });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://egg.example/ru/adepts/ilyamed/');
  const proxied = oldProfile({ params: { lang: 'ru', id: 'ilyamed' }, url: new URL('http://egg.example/ru/players/ilyamed/'), site: new URL('https://egg.example/') });
  assert.equal(proxied.headers.get('location'), 'https://egg.example/ru/adepts/ilyamed/');
  const opaque = '389b345e2f404f95c68edb05';
  assert.equal(oldProfile({ params: { lang: 'en', id: opaque }, url }).headers.get('location'), `https://egg.example/en/adepts/${opaque}/`);
  assert.equal(oldProfile({ params: { lang: 'ru', id: '../elsewhere' }, url }).status, 404);
});

test('old games URL redirects to the embedded block and keeps shared-game queries', () => {
  const url = new URL('https://egg.example/en/dark-side/games/?game=fry&fry=FRY3-3F');
  const response = oldGames({ params: { lang: 'en' }, url });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://egg.example/en/dark-side/?game=fry&fry=FRY3-3F#games');
  const proxied = oldGames({ params: { lang: 'en' }, url: new URL('http://egg.example/en/dark-side/games/?road=EGG1-E-1-0'), site: new URL('https://egg.example/') });
  assert.equal(proxied.headers.get('location'), 'https://egg.example/en/dark-side/?road=EGG1-E-1-0#games');
  assert.equal(oldGames({ params: { lang: 'other' }, url }).status, 404);
});
