import type { DeliveryKind } from "./capabilities";

type Band = { dps: number; score: number };
type BenchmarkProfile = { count: number; bands: Band[] };

// Generated from the 148 normalized PoB exports currently in
// data/benchmarks/normalized.jsonl. These are peer-context bands, not ground
// truth labels: the absolute PoB curve remains the dominant part of the score.
const profiles: Record<string, BenchmarkProfile> = {
  "self-cast/attack": { count: 62, bands: [
    { dps: 904_578, score: 3 }, { dps: 10_861_887, score: 4.5 }, { dps: 87_363_619, score: 6.5 },
    { dps: 129_325_160, score: 7.8 }, { dps: 261_035_183, score: 8.8 }, { dps: 531_568_266, score: 9.4 }, { dps: 1_374_432_220, score: 10 },
  ] },
  "totem/ballista": { count: 8, bands: [
    { dps: 751_183, score: 3 }, { dps: 47_452_966, score: 4.5 }, { dps: 63_262_300, score: 6.5 },
    { dps: 68_036_437, score: 7.8 }, { dps: 76_821_320, score: 8.8 }, { dps: 81_293_318, score: 9.4 }, { dps: 85_765_317, score: 10 },
  ] },
  minion: { count: 18, bands: [
    { dps: 10_755_760, score: 3 }, { dps: 79_404_236, score: 4.5 }, { dps: 132_541_923, score: 6.5 },
    { dps: 771_190_234, score: 7.8 }, { dps: 2_091_194_271, score: 8.8 }, { dps: 2_322_089_191, score: 9.4 }, { dps: 2_440_447_459, score: 10 },
  ] },
  trap: { count: 26, bands: [
    { dps: 31_033_155, score: 3 }, { dps: 108_263_553, score: 4.5 }, { dps: 437_551_152, score: 6.5 },
    { dps: 1_014_587_552, score: 7.8 }, { dps: 2_805_357_902, score: 8.8 }, { dps: 3_838_649_179, score: 9.4 }, { dps: 26_292_308_091, score: 10 },
  ] },
  mine: { count: 20, bands: [
    { dps: 41_706_126, score: 3 }, { dps: 43_782_976, score: 4.5 }, { dps: 56_103_117, score: 6.5 },
    { dps: 69_093_654, score: 7.8 }, { dps: 86_297_683, score: 8.8 }, { dps: 100_533_299, score: 9.4 }, { dps: 119_008_400, score: 10 },
  ] },
  brand: { count: 6, bands: [
    { dps: 904_578, score: 3 }, { dps: 10_861_887, score: 4.5 }, { dps: 87_363_619, score: 6.5 },
    { dps: 129_325_160, score: 7.8 }, { dps: 261_035_183, score: 8.8 }, { dps: 531_568_266, score: 9.4 }, { dps: 1_374_432_220, score: 10 },
  ] },
  unknown: { count: 11, bands: [
    { dps: 2_299_312, score: 3 }, { dps: 4_978_190, score: 4.5 }, { dps: 13_243_754, score: 6.5 },
    { dps: 99_325_519, score: 7.8 }, { dps: 114_594_309, score: 8.8 }, { dps: 252_875_733, score: 9.4 }, { dps: 458_787_998, score: 10 },
  ] },
};

const fallback = profiles["self-cast/attack"];

const interpolate = (value: number, bands: Band[]) => {
  if (value <= bands[0].dps) return bands[0].score;
  for (let index = 1; index < bands.length; index += 1) {
    const previous = bands[index - 1];
    const current = bands[index];
    if (value <= current.dps) {
      const span = Math.log10(current.dps) - Math.log10(previous.dps);
      const position = span > 0 ? (Math.log10(value) - Math.log10(previous.dps)) / span : 0;
      return previous.score + (current.score - previous.score) * Math.max(0, Math.min(1, position));
    }
  }
  return bands.at(-1)?.score ?? 10;
};

export function benchmarkDpsScore(dps: number, delivery: DeliveryKind): { score: number; peerScore: number; profile: BenchmarkProfile } {
  const profile = profiles[delivery] ?? fallback;
  const peerScore = interpolate(dps, profile.bands);
  return { score: Math.max(1, Math.min(10, peerScore)), peerScore, profile };
}

export const benchmarkRecordCount = 148;
export const benchmarkSummary = "148 normalized PoB exports across attack, trap, spell, minion, totem/ballista, channelled, mine, and mixed/unclear delivery groups";
