import { Battle, startBattle, tick, queueAction, surrenderBattle, persistPartyProgress, distributeEndOfBattleXp, BattleOptions, Combatant } from "./core/combat";
import { renderBattle, updateLive, PostBattleAction } from "./ui/battle";
import { renderSquadSelect, SquadResult } from "./ui/squadSelect";
import { renderHome, HomeAction } from "./ui/home";
import { renderStageSelect, StagePick, SURVIVAL_ENERGY_COST, BOSS_RAID_ENERGY_COST } from "./ui/stageSelect";

const SURVIVAL_XP_MULT = 1 / 50;
const BOSS_RAID_XP_MULT = 1 / 10;
import { renderUnitsScreen } from "./ui/unitsScreen";
import { renderSettings } from "./ui/settings";
import { consumeEnergy, getEnergy } from "./core/energy";
import { fetchServerEnergy, consumeServerEnergy } from "./auth/energyApi";
import { fetchDailyStatus, getCachedDailyMultiplier } from "./core/daily";
import { recordClear } from "./core/clears";
import { installGlobalClickSounds } from "./core/audio";
import { STAGE_DEFS, getStage, BOSS_RAID_FLOORS } from "./units/roster";
import { Stats } from "./core/stats";
import { loadSession, validateSession, clearSession, setVerifiedAddress, setVerifiedPerks, Session } from "./auth/session";
import { setUserScope } from "./auth/scope";
import { renderWalletGate } from "./ui/walletGate";
import { renderIgnGate } from "./ui/ignGate";
import { loadSettings, saveSettings } from "./ui/settings";
import { renderTutorial, isTutorialComplete } from "./ui/tutorial";
import { renderLeaderboard } from "./ui/leaderboard";
import { fetchServerIgn, saveServerIgn } from "./auth/ign";
import { showBossRaidReward, BossRaidReward } from "./ui/bossRaidReward";
import { playBgm, stopBgm } from "./core/bgm";
import { startRun, reportFloor, endRun, abortLiveRun, reportFloorCleared } from "./core/leaderboard";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

let currentSession: Session | null = null;

void bootstrap();

async function bootstrap(): Promise<void> {
  const existing = loadSession();
  if (existing) {
    const v = await validateSession(existing.token);
    if (v) {
      currentSession = existing;
      setVerifiedAddress(v.address);
      setVerifiedPerks(v.perks);
      setUserScope(v.address);
      ensureWalletInSettings(v.address);
      void proceedAfterAuth();
      return;
    }
    clearSession();
  }
  renderWalletGate(root!, async s => {
    currentSession = s;
    setVerifiedAddress(s.address);
    setUserScope(s.address);
    ensureWalletInSettings(s.address);
    // Fetch perks immediately after fresh auth so the gate is correct on first render.
    const v = await validateSession(s.token);
    if (v) setVerifiedPerks(v.perks);
    void proceedAfterAuth();
  });
}

async function proceedAfterAuth(): Promise<void> {
  // Seed the local energy cache from the server right after auth so devtools
  // edits made before login are immediately overwritten by the canonical value.
  void fetchServerEnergy();
  // Pre-fetch daily streak status so the cached multiplier is ready before
  // the first run starts.
  void fetchDailyStatus();
  const localIgn = loadSettings().playerName.trim();
  const serverIgn = await fetchServerIgn();

  if (localIgn && !serverIgn) {
    // Backfill: this wallet has a local IGN from before server-side persistence.
    // Save it up now so the leaderboard can display it. Cooldown doesn't apply
    // to the first-time set, so this is safe.
    void saveServerIgn(localIgn);
    runTutorialIfNeeded();
    return;
  }
  if (serverIgn) {
    if (serverIgn !== localIgn) {
      saveSettings({ ...loadSettings(), playerName: serverIgn });
    }
    runTutorialIfNeeded();
    return;
  }
  if (localIgn) { runTutorialIfNeeded(); return; }

  renderIgnGate(root!, runTutorialIfNeeded);
}

function runTutorialIfNeeded(): void {
  if (isTutorialComplete()) {
    startApp();
    return;
  }
  renderTutorial(root!, startApp);
}

function ensureWalletInSettings(address: string): void {
  const cur = loadSettings();
  if (cur.walletAddress !== address) {
    saveSettings({ ...cur, walletAddress: address });
  }
}

function startApp(): void {
  void currentSession;
  installGlobalClickSounds();
  showHome();
  requestAnimationFrame(t => { lastT = t; frame(t); });
}

type Screen = "home" | "stage_select" | "squad_select" | "battle" | "units" | "settings" | "leaderboard";

interface CarryEntry { hp: number; mp: number; xp: number; level: number; availablePoints: number; customStats: Stats; classId?: string; skillCooldowns?: Record<string, number>; gauge?: number; alive?: boolean }

let screen: Screen = "home";
let battle: Battle | null = null;
let lastT = performance.now();
let lastStateKind: string = "";
let lastCombatantCount: number = 0;
let lastAliveCount: number = 0;

// Mode state.
let currentStageId = 1;
let mode: "floor" | "survival" | "boss_raid" = "floor";
let survivalFloor = 1;
let survivalParty: SquadResult["players"] | null = null;
let survivalCarry: Record<string, CarryEntry> = {};

// Boss Raid state.
let brIndex = 0;                              // index into BOSS_RAID_FLOORS, 0 = first boss
let brParty: SquadResult["players"] | null = null;
let brCarry: Record<string, CarryEntry> = {};
let brBossStatReduction = 0;                  // stacking 5%-per-pick
let brPlayerStatBoost = 0;                    // stacking 10%-per-pick
let brPendingHeal = false;                    // one-shot 20% HP/MP at next floor start
let recordedThisBattle = false;
let battleConcluded = false;

function handleAction(unitId: string, skillId: string, targetId: string): void {
  if (!battle) return;
  queueAction(battle, unitId, skillId, targetId);
}

function showHome(): void {
  // If abandoning a live survival/boss-raid run mid-flight, finalize it so any
  // floors already cleared count toward the leaderboard.
  if ((mode === "survival" || mode === "boss_raid") && battle && battle.state.kind !== "victory" && battle.state.kind !== "defeat") {
    void endRun();
  }
  abortLiveRun();
  screen = "home";
  battle = null;
  playBgm();
  renderHome(root!, onHomeAction);
}

function onHomeAction(a: HomeAction): void {
  if (a === "tower") showStageSelect();
  else if (a === "units") showUnits();
  else if (a === "settings") showSettings();
  else if (a === "tutorial") showTutorialReplay();
  else if (a === "leaderboard") showLeaderboard();
}

function showLeaderboard(): void {
  screen = "leaderboard";
  renderLeaderboard(root!, showHome);
}

function showTutorialReplay(): void {
  stopBgm();
  renderTutorial(root!, () => {
    showHome();
  }, { mode: "replay" });
}

function showStageSelect(): void {
  screen = "stage_select";
  playBgm();
  renderStageSelect(root!, onStagePicked, showHome);
}

function onStagePicked(pick: StagePick): void {
  if (pick.kind === "floor") {
    mode = "floor";
    currentStageId = pick.id;
    showSquadSelect();
  } else if (pick.kind === "survival") {
    if (getEnergy() < SURVIVAL_ENERGY_COST) {
      alert(`Survival Mode requires ${SURVIVAL_ENERGY_COST} energy.`);
      return;
    }
    mode = "survival";
    currentStageId = 1;
    survivalFloor = 1;
    survivalParty = null;
    survivalCarry = {};
    showSquadSelect();
  } else { // boss_raid
    if (getEnergy() < BOSS_RAID_ENERGY_COST) {
      alert(`Boss Raid requires ${BOSS_RAID_ENERGY_COST} energy.`);
      return;
    }
    mode = "boss_raid";
    currentStageId = BOSS_RAID_FLOORS[0]?.id ?? 1;
    brIndex = 0;
    brParty = null;
    brCarry = {};
    brBossStatReduction = 0;
    brPlayerStatBoost = 0;
    brPendingHeal = false;
    showSquadSelect();
  }
}

function showSquadSelect(): void {
  screen = "squad_select";
  battle = null;
  renderSquadSelect(root!, currentStageId, startBattleFromSquad, showStageSelect);
}

function showUnits(): void {
  screen = "units";
  playBgm();
  renderUnitsScreen(root!, showHome);
}

function showSettings(): void {
  screen = "settings";
  renderSettings(root!, showHome);
}

async function startBattleFromSquad(squad: SquadResult): Promise<void> {
  const cost = mode === "survival" ? SURVIVAL_ENERGY_COST
             : mode === "boss_raid" ? BOSS_RAID_ENERGY_COST
             : 1;
  // Server-authoritative energy: localStorage edits no longer grant runs.
  const r = await consumeServerEnergy(cost);
  if (!r.ok) {
    if ("error" in r) alert("Couldn't reach server to start battle. Try again.");
    else alert(`Not enough energy (need ${cost}, have ${r.amount}).`);
    return;
  }
  // Keep the local cache in sync so the energy pill matches.
  consumeEnergy(cost);

  if (mode === "survival") {
    survivalParty = squad.players;
    survivalFloor = 1;
    survivalCarry = {};
    void startRun("survival", squad.players.map(p => p.template.id));
    runFloor(squad.players, 1, SURVIVAL_XP_MULT);
  } else if (mode === "boss_raid") {
    brParty = squad.players;
    brIndex = 0;
    brCarry = {};
    void startRun("boss_raid", squad.players.map(p => p.template.id));
    const firstBoss = BOSS_RAID_FLOORS[0];
    if (firstBoss) runBossRaidFloor(squad.players, firstBoss.id);
  } else {
    runFloor(squad.players, currentStageId, 1.0);
  }
}

function applyBossRaidReward(r: BossRaidReward): void {
  if (r === "heal") brPendingHeal = true;
  else if (r === "boost") brPlayerStatBoost += 0.10;
  else if (r === "weaken") brBossStatReduction = Math.min(0.95, brBossStatReduction + 0.05);
}

function runBossRaidFloor(party: SquadResult["players"], floorId: number): void {
  const stage = getStage(floorId);
  if (!stage) { showHome(); return; }
  const opts: BattleOptions = {
    xpMultiplier: BOSS_RAID_XP_MULT * getCachedDailyMultiplier(),
    bossRaid: true,
    bossStatReduction: brBossStatReduction,
    playerStatBoost: brPlayerStatBoost,
    pendingHeal: brPendingHeal,
  };
  if (Object.keys(brCarry).length > 0) opts.carryover = brCarry;
  brPendingHeal = false; // consumed
  battle = startBattle(party, stage.enemies, undefined, opts);
  screen = "battle";
  stopBgm();
  recordedThisBattle = false;
  battleConcluded = false;
  lastStateKind = battle.state.kind;
  lastCombatantCount = battle.combatants.length;
  lastAliveCount = battle.combatants.filter(c => c.alive).length;
  renderBattle(root!, battle, handleAction, onPostBattle);
}

function runFloor(party: SquadResult["players"], floorId: number, xpMultiplier: number): void {
  const stage = getStage(floorId);
  if (!stage) { showHome(); return; }
  const opts: BattleOptions = { xpMultiplier: xpMultiplier * getCachedDailyMultiplier() };
  if (mode === "survival" && Object.keys(survivalCarry).length > 0) {
    opts.carryover = survivalCarry;
  }
  battle = startBattle(party, stage.enemies, undefined, opts);
  screen = "battle";
  stopBgm();
  recordedThisBattle = false;
  battleConcluded = false;
  lastStateKind = battle.state.kind;
  lastCombatantCount = battle.combatants.length;
  lastAliveCount = battle.combatants.filter(c => c.alive).length;
  renderBattle(root!, battle, handleAction, onPostBattle);
}

function shouldShowPostButtons(b: Battle): boolean {
  if (b.state.kind === "ticking") return true;
  // Defeat — always show.
  if (b.state.kind === "defeat") return true;
  // Floor mode — always show.
  if (mode === "floor") return true;
  // Boss raid victory: only show on the final boss.
  if (mode === "boss_raid") return brIndex >= BOSS_RAID_FLOORS.length;
  // Survival victory: only show on the final floor.
  return survivalFloor >= STAGE_DEFS.length;
}

function captureCarry(b: Battle): void {
  survivalCarry = captureCarryFrom(b);
}
function captureBrCarry(b: Battle): void {
  brCarry = captureCarryFrom(b);
}
function captureCarryFrom(b: Battle): Record<string, CarryEntry> {
  const out: Record<string, CarryEntry> = {};
  for (const c of b.combatants) {
    if (c.side !== "player") continue;
    out[c.templateId] = {
      hp: c.hp,
      mp: c.mp,
      xp: c.xp,
      level: c.level,
      availablePoints: c.availablePoints,
      customStats: c.statBreakdown.custom,
      classId: c.classId,
      skillCooldowns: { ...c.skillCooldowns },
      gauge: c.gauge,
      alive: c.alive,
    };
  }
  return out;
}

function onPostBattle(a: PostBattleAction): void {
  if (a === "surrender") {
    if (battle) surrenderBattle(battle);
    return;
  }
  if (a === "home") showHome();
  else if (a === "stages") showStageSelect();
}

function frame(t: number): void {
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;

  if (screen === "battle" && battle) {
    if (battle.state.kind === "ticking") tick(battle, dt);

    // Record clears + handle survival advancement once per battle conclusion.
    if (!battleConcluded && battle.state.kind === "victory") {
      battleConcluded = true;
      if (mode === "floor" && !recordedThisBattle) {
        recordClear(currentStageId);
        void reportFloorCleared(currentStageId);
        recordedThisBattle = true;
      }
      if (mode === "survival") {
        captureCarry(battle);
        void reportFloor(survivalFloor);
        if (survivalFloor < STAGE_DEFS.length) {
          survivalFloor += 1;
          // Brief delay before auto-advance so player can see the Victory banner.
          setTimeout(() => {
            if (mode !== "survival" || !survivalParty) return;
            runFloor(survivalParty, survivalFloor, SURVIVAL_XP_MULT);
          }, 1500);
        } else {
          recordClear(STAGE_DEFS.length);
          void endRun();
        }
      }
      if (mode === "boss_raid") {
        captureBrCarry(battle);
        brIndex += 1;
        void reportFloor(brIndex);
        if (brIndex < BOSS_RAID_FLOORS.length) {
          // Pause briefly to let the Victory banner read, then offer the boon picker.
          setTimeout(() => {
            if (mode !== "boss_raid" || !brParty) return;
            showBossRaidReward(root!, (reward) => {
              applyBossRaidReward(reward);
              const nextBoss = BOSS_RAID_FLOORS[brIndex];
              if (mode !== "boss_raid" || !brParty || !nextBoss) return;
              runBossRaidFloor(brParty, nextBoss.id);
            });
          }, 1200);
        } else {
          void endRun();
        }
      }
    }

    if (!battleConcluded && battle.state.kind === "defeat") {
      battleConcluded = true;
      if (mode === "survival" || mode === "boss_raid") void endRun();
      // Persisted by combat.ts already.
    }

    const aliveNow = battle.combatants.filter(c => c.alive).length;
    if (battle.state.kind !== lastStateKind || battle.combatants.length !== lastCombatantCount || aliveNow !== lastAliveCount) {
      renderBattle(root!, battle, handleAction, onPostBattle, { showPostBattleButtons: shouldShowPostButtons(battle) });
      lastStateKind = battle.state.kind;
      lastCombatantCount = battle.combatants.length;
      lastAliveCount = aliveNow;
    } else {
      updateLive(root!, battle);
    }
  }

  requestAnimationFrame(frame);
}

window.addEventListener("keydown", e => {
  if ((e.key === "r" || e.key === "R") &&
      screen === "battle" && battle &&
      (battle.state.kind === "victory" || battle.state.kind === "defeat")) {
    showHome();
  }
});

// Re-export for type usage above (minor lint).
export type _Unused = Combatant;
export const _persistPartyProgress = persistPartyProgress;
export const _distributeEndOfBattleXp = distributeEndOfBattleXp;
