import { Battle, startBattle, tick, queueAction, surrenderBattle, persistPartyProgress, distributeEndOfBattleXp, BattleOptions, Combatant } from "./core/combat";
import { renderBattle, updateLive, PostBattleAction } from "./ui/battle";
import { renderSquadSelect, SquadResult } from "./ui/squadSelect";
import { renderHome, HomeAction } from "./ui/home";
import { renderStageSelect, StagePick, SURVIVAL_ENERGY_COST } from "./ui/stageSelect";
import { renderUnitsScreen } from "./ui/unitsScreen";
import { renderSettings } from "./ui/settings";
import { consumeEnergy, getEnergy } from "./core/energy";
import { recordClear } from "./core/clears";
import { installGlobalClickSounds } from "./core/audio";
import { STAGE_DEFS, getStage } from "./units/roster";
import { Stats } from "./core/stats";
import { loadSession, validateSession, clearSession, Session } from "./auth/session";
import { setUserScope } from "./auth/scope";
import { renderWalletGate } from "./ui/walletGate";
import { playBgm, stopBgm } from "./core/bgm";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

let currentSession: Session | null = null;

void bootstrap();

async function bootstrap(): Promise<void> {
  const existing = loadSession();
  if (existing) {
    const addr = await validateSession(existing.token);
    if (addr) {
      currentSession = existing;
      setUserScope(addr);
      startApp();
      return;
    }
    clearSession();
  }
  renderWalletGate(root!, s => {
    currentSession = s;
    setUserScope(s.address);
    startApp();
  });
}

function startApp(): void {
  void currentSession;
  installGlobalClickSounds();
  showHome();
  requestAnimationFrame(t => { lastT = t; frame(t); });
}

type Screen = "home" | "stage_select" | "squad_select" | "battle" | "units" | "settings";

interface CarryEntry { hp: number; mp: number; xp: number; level: number; availablePoints: number; customStats: Stats; classId?: string; skillCooldowns?: Record<string, number>; gauge?: number; alive?: boolean }

let screen: Screen = "home";
let battle: Battle | null = null;
let lastT = performance.now();
let lastStateKind: string = "";
let lastCombatantCount: number = 0;
let lastAliveCount: number = 0;

// Mode state.
let currentStageId = 1;
let mode: "floor" | "survival" = "floor";
let survivalFloor = 1;
let survivalParty: SquadResult["players"] | null = null;
let survivalCarry: Record<string, CarryEntry> = {};
let recordedThisBattle = false;
let battleConcluded = false;

function handleAction(unitId: string, skillId: string, targetId: string): void {
  if (!battle) return;
  queueAction(battle, unitId, skillId, targetId);
}

function showHome(): void {
  screen = "home";
  battle = null;
  playBgm();
  renderHome(root!, onHomeAction);
}

function onHomeAction(a: HomeAction): void {
  if (a === "tower") showStageSelect();
  else if (a === "units") showUnits();
  else if (a === "settings") showSettings();
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
  } else {
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

function startBattleFromSquad(squad: SquadResult): void {
  if (mode === "survival") {
    if (!consumeEnergy(SURVIVAL_ENERGY_COST)) {
      alert("Energy could not be consumed.");
      return;
    }
    survivalParty = squad.players;
    survivalFloor = 1;
    survivalCarry = {};
    runFloor(squad.players, 1, 0.5);
  } else {
    if (getEnergy() <= 0) { alert("No energy left."); return; }
    if (!consumeEnergy(1)) { alert("Energy could not be consumed."); return; }
    runFloor(squad.players, currentStageId, 1.0);
  }
}

function runFloor(party: SquadResult["players"], floorId: number, xpMultiplier: number): void {
  const stage = getStage(floorId);
  if (!stage) { showHome(); return; }
  const opts: BattleOptions = { xpMultiplier };
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
  // Survival victory: only show on the final floor.
  return survivalFloor >= STAGE_DEFS.length;
}

function captureCarry(b: Battle): void {
  survivalCarry = {};
  for (const c of b.combatants) {
    if (c.side !== "player") continue;
    survivalCarry[c.templateId] = {
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
        recordedThisBattle = true;
      }
      if (mode === "survival") {
        captureCarry(battle);
        if (survivalFloor < STAGE_DEFS.length) {
          survivalFloor += 1;
          // Brief delay before auto-advance so player can see the Victory banner.
          setTimeout(() => {
            if (mode !== "survival" || !survivalParty) return;
            runFloor(survivalParty, survivalFloor, 0.5);
          }, 1500);
        } else {
          recordClear(STAGE_DEFS.length);
        }
      }
    }

    if (!battleConcluded && battle.state.kind === "defeat") {
      battleConcluded = true;
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
