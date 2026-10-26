import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAchievementRarity} from '../src/server/achievementRarity.ts';
import {achievementFrequency} from '../src/features/Portal/achievementFrequency.ts';

test('frequency counts registered players once, including legacy road awards, and handles an empty population', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE accounts(player TEXT PRIMARY KEY); CREATE TABLE portal_achievements(player TEXT,achievement TEXT,PRIMARY KEY(player,achievement)); CREATE TABLE records(player TEXT,score INTEGER);');
    const rarity=createAchievementRarity(db);
    assert.equal(rarity.readStats().total,0); assert.equal(rarity.read()['fry.thousand'],0);
    for(const player of ['a','b','c','d'])db.prepare('INSERT INTO accounts VALUES (?)').run(player);
    for(const player of ['a','b','guest'])db.prepare('INSERT INTO portal_achievements VALUES (?,?)').run(player,'fry.thousand');
    db.prepare('INSERT INTO portal_achievements VALUES (?,?)').run('a','fry.jackpot');
    db.prepare('INSERT INTO portal_achievements VALUES (?,?)').run('a','road.thousand');
    db.exec("INSERT INTO records VALUES ('a',1200),('a',1500),('b',1800),('guest',2000)");
    rarity.invalidate();const stats=rarity.readStats();
    assert.equal(stats.total,4);assert.equal(stats.counts['fry.thousand'],2);assert.equal(stats.percentages['fry.thousand'],50);
    assert.equal(stats.counts['fry.jackpot'],1);assert.equal(stats.percentages['fry.jackpot'],25);
    assert.equal(stats.counts['road.thousand'],2,'legacy and explicit awards must not count the same player twice');
    stats.counts['fry.thousand']=100;stats.percentages['fry.thousand']=999;
    assert.equal(rarity.readStats().counts['fry.thousand'],2,'callers cannot mutate cached frequency');
    assert.equal(rarity.read()['fry.thousand'],50);
  }finally{db.close();}
});

test('frequency refreshes after another SQLite connection awards an achievement or adds a player', async () => {
  const directory=await mkdtemp(join(tmpdir(),'egg-rarity-'));const db=new DatabaseSync(join(directory,'db'));let other;
  try {
    db.exec("CREATE TABLE accounts(player TEXT PRIMARY KEY); CREATE TABLE portal_achievements(player TEXT,achievement TEXT,PRIMARY KEY(player,achievement)); CREATE TABLE records(player TEXT,score INTEGER); INSERT INTO accounts VALUES ('a')");
    const rarity=createAchievementRarity(db);assert.equal(rarity.read()['fry.thousand'],0);
    other=new DatabaseSync(join(directory,'db'));other.exec("INSERT INTO portal_achievements VALUES ('a','fry.thousand')");
    assert.equal(rarity.read()['fry.thousand'],100);
    other.exec("INSERT INTO accounts VALUES ('b')");assert.equal(rarity.readStats().total,2);assert.equal(rarity.read()['fry.thousand'],50);
  }finally{other?.close();db.close();await rm(directory,{recursive:true,force:true});}
});

test('display describes frequency without exposing population or claiming a ranking, including old API payloads', () => {
  const value=percentage=>({achievementRarity:{award:percentage},achievementPopulation:4,achievementCounts:{award:2}});
  assert.equal(achievementFrequency(value(50),'award','ru'),'Есть у 50% игроков');
  assert.equal(achievementFrequency(value(25),'award','en'),'Earned by 25% of players');
  assert.equal(achievementFrequency(value(0.01),'award','en'),'Earned by <1% of players');
  assert.equal(achievementFrequency(value(99.99),'award','en'),'Earned by >99% of players');
  assert.equal(achievementFrequency(value(0),'award','ru'),'Пока никто не получил');
  assert.equal(achievementFrequency({achievementRarity:{}},'award','ru'),null,'missing statistics are not zero');
});
