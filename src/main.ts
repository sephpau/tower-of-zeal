import { Battle, startBattle, tick, queueAction, surrenderBattle, persistPartyProgress, distributeEndOfBattleXp, BattleOptions, Combatant } from "./core/combat";
import { renderBattle, updateLive, PostBattleAction } from "./ui/battle";
import { renderSquadSelect, SquadResult } from "./ui/squadSelect";
import { renderHome, HomeAction } from "./ui/home";
import { renderStageSelect, StagePick, SURVIVAL_ENERGY_COST, BOSS_RAID_ENERGY_COST } from "./ui/stageSelect";

const SURVIVAL_XP_MULT = 1 / 50;
const BOSS_RAID_XP_MULT = 1 / 10;
import { renderUnitsScreen } from "./ui/unitsScreen";
import { renderSettings } from "./ui/settings";
import { getEnergy } from "./core/energy";
import { fetchServerEnergy, consumeServerEnergy } from "./auth/energyApi";
import { fetchDailyStatus, getCachedDailyMultiplier } from "./core/daily";
import { renderRunSummary, RunSummary, RunSummaryUnit, pickMvpId } from "./ui/runSummary";
import { getProgress, setProgress } from "./core/progress";
import { awardXp } from "./core/levels";
import {
  startReplayRecording, abortRecording, finalizeReplay,
  recordBattleStart, ReplayBlob, ReplayPlayer, REPLAY_VERSION,
  ReplayPartyMember,
} from "./core/replay";
import { ATB_FULL } from "./core/timeline";
import { recordClear } from "./core/clears";
import { installGlobalClickSounds } from "./core/audio";
import { STAGE_DEFS, getStage, BOSS_RAID_FLOORS, PLAYER_ROSTER } from "./units/roster";
import { Stats } from "./core/stats";
import { loadSession, validateSession, clearSession, setVerifiedAddress, setVerifiedPerks, Session } from "./auth/session";
import { setUserScope } from "./auth/scope";
import { renderWalletGate } from "./ui/walletGate";
import { renderIgnGate } from "./ui/ignGate";
import { loadSettings, saveSettings } from "./ui/settings";
import { renderTutorial, isTutorialComplete } from "./ui/tutorial";
import { renderCodex } from "./ui/codex";
import { renderLeaderboard } from "./ui/leaderboard";
import { fetchServerIgn, saveServerIgn } from "./auth/ign";
import { showBossRaidReward, BossRaidReward } from "./ui/bossRaidReward";
import { playBgm, stopBgm, playBattleBgm } from "./core/bgm";
import { startRun, reportFloor, endRun, abortLiveRun, reportFloorCleared, getLiveRun, fetchFloorRetryStatus, claimFloorRetry } from "./core/leaderboard";

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

type Screen = "home" | "stage_select" | "squad_select" | "battle" | "units" | "settings" | "leaderboard" | "run_summary" | "replay" | "codex";

interface CarryEntry { hp: number; mp: number; xp: number; level: number; availablePoints: number; customStats: Stats; classId?: string; skillCooldowns?: Record<string, number>; gauge?: number; alive?: boolean; damageDealt?: number; damageTaken?: number; kills?: number; xpGainedTotal?: number }

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
// Floor mode state — used to power the free-retry-on-defeat flow.
// Retry cap is enforced server-side per wallet per PH day so refreshing the
// page or starting another fresh battle can't grant more retries.
let floorParty: SquadResult["players"] | null = null;
let floorRetriesRemaining: number | null = null; // last known server value

/** Stage id of the floor currently being fought. Used by the slow-mo gate. */
let currentBattleStageId = 0;
/** Floors 31+ render in slow motion (75% speed) for added drama. */
const SLOWMO_STAGE_THRESHOLD = 31;
const SLOWMO_FACTOR = 0.75;
function isSlowMoStage(): boolean { return currentBattleStageId >= SLOWMO_STAGE_THRESHOLD; }

// Boss Raid state.
let brIndex = 0;                              // index into BOSS_RAID_FLOORS, 0 = first boss
let brParty: SquadResult["players"] | null = null;
let brCarry: Record<string, CarryEntry> = {};
let brBossStatReduction = 0;                  // stacking 5%-per-pick
let brPlayerStatBoost = 0;                    // stacking 10%-per-pick
let brPendingHeal = false;                    // one-shot 20% HP/MP at next floor start
let recordedThisBattle = false;
let battleConcluded = false;
/** Wall-clock ms when the current floor-mode battle started. Used for the
 *  Fastest World Ender leaderboard on floor-50 clears. */
let floorBattleStartedAt = 0;

/** Active replay playback (null when not in replay mode). */
let replayPlayer: ReplayPlayer | null = null;
let replayLabel = "";  // "Spectating: IGN" string for the header

/** Begin watching a recorded replay. Reconstructs a deterministic battle from
 *  the blob and switches to the replay screen. Multi-floor replays auto-advance
 *  through each battle in order. */
export function playReplay(blob: ReplayBlob): void {
  if (blob.v !== REPLAY_VERSION) {
    alert("This replay was recorded on a different game version and can't be played.");
    return;
  }
  if (!blob.battles || blob.battles.length === 0) { alert("Empty replay."); return; }

  // Stop any in-progress runs / recordings.
  abortLiveRun();
  abortRecording();

  replayPlayer = new ReplayPlayer(blob);
  replayLabel = blob.ign ? `Spectating: ${blob.ign}` : "Spectating replay";
  screen = "replay";
  stopBgm();
  recordedThisBattle = false;
  battleConcluded = false;

  if (!loadReplayBattle()) { showLeaderboard(); return; }
  showReplayBanner(replayLabel);
}

/** Set up the current battle from the active replay player. Returns false if
 *  the replay's stage / party can't be reconstructed. */
function loadReplayBattle(): boolean {
  if (!replayPlayer) return false;
  const rb = replayPlayer.currentBattle();
  if (!rb) return false;
  const stage = getStage(rb.stageId);
  if (!stage) { alert("Replay references an unknown stage."); return false; }

  const PLAYER_BY_ID = new Map(PLAYER_ROSTER.map(t => [t.id, t]));
  const players: SquadResult["players"] = [];
  const partyOverride: NonNullable<BattleOptions["partyOverride"]> = {};
  rb.party.forEach((m, i) => {
    const t = PLAYER_BY_ID.get(m.templateId);
    if (!t) return;
    players.push({ template: t, position: { row: i, col: 0 } });
    partyOverride[m.templateId] = {
      classId: m.classId,
      level: m.level,
      customStats: m.customStats,
      equippedSkills: m.equippedSkills,
      hp: m.hp,
      mp: m.mp,
      gauge: m.gauge,
      alive: m.alive,
      skillCooldowns: m.skillCooldowns,
    };
  });
  if (players.length === 0) { alert("Replay has no valid party."); return false; }

  battle = startBattle(players, stage.enemies, rb.seed, {
    xpMultiplier: 1,
    partyOverride,
  });
  battle.replayMode = true;
  currentBattleStageId = rb.stageId;
  lastStateKind = battle.state.kind;
  lastCombatantCount = battle.combatants.length;
  lastAliveCount = battle.combatants.filter(c => c.alive).length;
  playBattleBgm(
    rb.stageId,
    replayPlayer.blob.mode === "boss_raid" ? "boss_raid" : replayPlayer.blob.mode === "survival" ? "survival" : "floor",
    !!stage.soloBoss,
  );
  renderBattle(root!, battle, () => undefined, () => showLeaderboard(), {
    showPostBattleButtons: false,
    slowMo: isSlowMoStage(),
  });
  return true;
}

function showReplayBanner(text: string): void {
  hideReplayBanner();
  const banner = document.createElement("div");
  banner.className = "replay-banner";
  banner.id = "replay-banner";
  banner.innerHTML = `<span class="replay-banner-text">${escapeHtmlReplay(text)}</span><button class="replay-banner-close" id="replay-banner-close">Stop watching</button>`;
  document.body.appendChild(banner);
  document.getElementById("replay-banner-close")?.addEventListener("click", () => showLeaderboard());
}

function hideReplayBanner(): void {
  document.getElementById("replay-banner")?.remove();
}

function escapeHtmlReplay(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** During replay playback, look at every alive ready player and assign them
 *  the next recorded action so executeAction can resolve as if a player had queued it. */
function injectReplayActions(b: Battle): void {
  if (!replayPlayer) return;
  const players = b.combatants.filter(c => c.side === "player");
  const enemies = b.combatants.filter(c => c.side === "enemy");
  for (let i = 0; i < players.length; i++) {
    const c = players[i];
    if (!c.alive) continue;
    if (c.queuedAction) continue;
    if (c.gauge < ATB_FULL * 0.95) continue;  // wait until they're nearly ready
    const next = replayPlayer.pollAction(i);
    if (!next) {
      // No more recorded actions — idle so the queue keeps moving.
      c.queuedAction = { skillId: "idle", targetId: c.id };
      continue;
    }
    let targetId = c.id;
    if (next.targetIdx >= 0 && next.targetIdx < enemies.length) {
      const t = enemies[next.targetIdx];
      if (t && t.alive) targetId = t.id;
      else {
        // Original target is dead — fallback to first alive enemy.
        const alive = enemies.find(e => e.alive);
        if (alive) targetId = alive.id;
      }
    }
    c.queuedAction = { skillId: next.skillId, targetId };
  }
}

/** Snapshot a survival/boss-raid run's per-unit aggregates from the active battle. */
function buildRunSummaryUnits(b: Battle): RunSummaryUnit[] {
  return b.combatants
    .filter(c => c.side === "player")
    .map(c => ({
      templateId: c.templateId,
      level: c.level,
      xpGained: c.xpGainedTotal,
      damageDealt: c.damageDealt,
      damageTaken: c.damageTaken,
      kills: c.kills,
    }));
}

async function showRunSummary(outcome: "victory" | "defeat", floorsCleared: number): Promise<void> {
  if (!battle) { showHome(); return; }
  const runMode: RunSummary["mode"] = mode === "boss_raid" ? "boss_raid"
                                    : mode === "survival" ? "survival"
                                    : "floor";
  const units = buildRunSummaryUnits(battle);
  let totalMs = 0;
  let submitted = false;
  let floorLabel: string | undefined;

  if (runMode === "survival" || runMode === "boss_raid") {
    const startedAt = getLiveRun()?.startedAt ?? Date.now();
    // Finalize the multi-floor replay blob and ship it alongside the run-end
    // call. The server only persists it if this run actually beat the wallet's
    // prior best.
    const replay = finalizeReplay();
    const result = await endRun(replay ?? undefined);
    totalMs = result?.totalMs ?? Math.max(0, Date.now() - startedAt);
    submitted = !!result;
  } else {
    // Floor mode: use the per-battle wall-clock elapsed time we tracked when
    // the battle started, and surface the stage name in the headline.
    totalMs = floorBattleStartedAt > 0 ? Math.max(0, Date.now() - floorBattleStartedAt) : 0;
    const stage = getStage(currentStageId);
    if (stage) floorLabel = stage.name;
  }

  // MVP bonus: +20% XP to the unit with the highest damage+kills score.
  // Applied after the main run XP has been distributed and persisted, so the
  // bonus stacks on the level the MVP just earned. Skipped on defeat without
  // any earned XP to avoid awarding a zero bonus.
  const MVP_XP_BONUS = 0.2;
  const mvpId = pickMvpId(units);
  let mvpBonusXp = 0;
  if (mvpId) {
    const mvpUnit = units.find(u => u.templateId === mvpId);
    if (mvpUnit && mvpUnit.xpGained > 0) {
      const bonus = Math.floor(mvpUnit.xpGained * MVP_XP_BONUS);
      if (bonus > 0) {
        const cur = getProgress(mvpId);
        const lifted = { level: cur.level, xp: cur.xp };
        const gained = awardXp(lifted, bonus);
        setProgress(mvpId, {
          ...cur,
          level: lifted.level,
          xp: lifted.xp,
          availablePoints: cur.availablePoints + gained * 4,
        });
        mvpUnit.level = lifted.level;
        mvpUnit.xpGained += bonus;
        mvpBonusXp = bonus;
      }
    }
  }

  const summary: RunSummary = {
    mode: runMode,
    outcome,
    floorsCleared,
    totalMs,
    units,
    submitted,
    floorLabel,
    mvpId,
    mvpBonusXp,
    battleLog: battle ? battle.log.slice() : undefined,
    playerNames: battle ? Array.from(new Set(battle.combatants.filter(c => c.side === "player").map(c => c.name))) : undefined,
    enemyNames: battle ? Array.from(new Set(battle.combatants.filter(c => c.side === "enemy").map(c => c.name))) : undefined,
  };

  abortLiveRun();
  screen = "run_summary";
  battle = null;
  playBgm();

  // Floor-mode defeats can offer free retries, capped per wallet per PH day on
  // the server. Read the current quota before rendering so the button shows
  // the accurate remaining count.
  if (runMode === "floor" && outcome === "defeat") {
    const status = await fetchFloorRetryStatus(currentStageId);
    const remaining = status?.remaining ?? floorRetriesRemaining ?? 0;
    floorRetriesRemaining = remaining;
    if (remaining > 0) {
      renderRunSummary(root!, summary, showHome, {
        onRetry: () => { void retryCurrentFloor(); },
        retryLabel: `Retry (${remaining} free left)`,
      });
      return;
    }
  }

  renderRunSummary(root!, summary, showHome);
}

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
  abortRecording();
  hideReplayBanner();
  replayPlayer = null;
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
  else if (a === "codex") showCodex();
}

function showCodex(): void {
  screen = "codex" as Screen;
  renderCodex(root!, showHome);
}

function showLeaderboard(): void {
  hideReplayBanner();
  replayPlayer = null;
  battle = null;
  screen = "leaderboard";
  renderLeaderboard(root!, showHome, playReplay);
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
  // consumeServerEnergy() already writes the server's post-deduct amount into
  // localStorage on success — no further local consume needed.
  const r = await consumeServerEnergy(cost);
  if (!r.ok) {
    if ("error" in r) alert("Couldn't reach server to start battle. Try again.");
    else alert(`Not enough energy (need ${cost}, have ${r.amount}).`);
    return;
  }

  if (mode === "survival") {
    survivalParty = squad.players;
    survivalFloor = 1;
    survivalCarry = {};
    void startRun("survival", squad.players.map(p => p.template.id));
    startReplayRecording("survival", loadSettings().playerName || null);
    runFloor(squad.players, 1, SURVIVAL_XP_MULT);
  } else if (mode === "boss_raid") {
    brParty = squad.players;
    brIndex = 0;
    brCarry = {};
    void startRun("boss_raid", squad.players.map(p => p.template.id));
    startReplayRecording("boss_raid", loadSettings().playerName || null);
    const firstBoss = BOSS_RAID_FLOORS[0];
    if (firstBoss) runBossRaidFloor(squad.players, firstBoss.id);
  } else {
    floorParty = squad.players;
    runFloor(squad.players, currentStageId, 1.0);
  }
}

/** Re-run the current floor without consuming energy. Server enforces the
 *  per-wallet, per-day retry cap. */
async function retryCurrentFloor(): Promise<void> {
  if (mode !== "floor" || !floorParty) { showHome(); return; }
  const claim = await claimFloorRetry(currentStageId);
  if (!claim) { alert("Couldn't reach the server. Try again."); return; }
  if (!claim.ok) {
    alert("No free retries left for today. Come back after 8 AM PH.");
    floorRetriesRemaining = 0;
    showHome();
    return;
  }
  floorRetriesRemaining = claim.remaining;
  runFloor(floorParty, currentStageId, 1.0);
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
  const seed = (Date.now() & 0xffffffff) >>> 0;
  battle = startBattle(party, stage.enemies, seed, opts);
  recordBattleStart({
    stageId: floorId,
    seed: battle.seed,
    enemies: stage.enemies.map(e => e.id),
    party: snapshotPartyForReplay(party, brCarry),
  });
  screen = "battle";
  recordedThisBattle = false;
  battleConcluded = false;
  currentBattleStageId = floorId;
  lastStateKind = battle.state.kind;
  lastCombatantCount = battle.combatants.length;
  lastAliveCount = battle.combatants.filter(c => c.alive).length;
  playBattleBgm(floorId, "boss_raid", !!stage.soloBoss);
  renderBattle(root!, battle, handleAction, onPostBattle, { slowMo: isSlowMoStage() });
}

function runFloor(party: SquadResult["players"], floorId: number, xpMultiplier: number): void {
  const stage = getStage(floorId);
  if (!stage) { showHome(); return; }
  const opts: BattleOptions = { xpMultiplier: xpMultiplier * getCachedDailyMultiplier() };
  if (mode === "survival" && Object.keys(survivalCarry).length > 0) {
    opts.carryover = survivalCarry;
  }
  // Replay scope:
  //   - floor mode: only the floor-50 World Ender battle is recorded
  //   - survival: every floor recorded (recording was started in startBattleFromSquad)
  const recordThisBattle = (mode === "floor" && floorId === 50) || mode === "survival";
  if (mode === "floor" && floorId === 50) {
    // Floor-mode World Ender uses its own one-shot recording.
    startReplayRecording("floor", loadSettings().playerName || null);
  }
  const seed = recordThisBattle ? (Date.now() & 0xffffffff) >>> 0 : undefined;
  battle = startBattle(party, stage.enemies, seed, opts);
  if (recordThisBattle) {
    recordBattleStart({
      stageId: floorId,
      seed: battle.seed,
      enemies: stage.enemies.map(e => e.id),
      party: snapshotPartyForReplay(party, mode === "survival" ? survivalCarry : undefined),
    });
  }
  screen = "battle";
  recordedThisBattle = false;
  battleConcluded = false;
  currentBattleStageId = floorId;
  if (mode === "floor") floorBattleStartedAt = Date.now();
  lastStateKind = battle.state.kind;
  lastCombatantCount = battle.combatants.length;
  lastAliveCount = battle.combatants.filter(c => c.alive).length;
  playBattleBgm(floorId, mode, !!stage.soloBoss);
  renderBattle(root!, battle, handleAction, onPostBattle, { slowMo: isSlowMoStage() });
}

/** Build per-template party state at floor start for the replay recorder.
 *  Pulls from carry if present (mid-run), else from getProgress(). */
function snapshotPartyForReplay(
  party: SquadResult["players"],
  carry?: Record<string, CarryEntry>,
): ReplayPartyMember[] {
  return party.map(p => {
    const prog = getProgress(p.template.id);
    const equippedSkills = [...(prog.equippedSkills ?? [])];
    const co = carry?.[p.template.id];
    if (co) {
      return {
        templateId: p.template.id,
        classId: co.classId ?? prog.classId,
        level: co.level,
        customStats: { ...co.customStats },
        equippedSkills,
        hp: co.hp,
        mp: co.mp,
        gauge: typeof co.gauge === "number" ? co.gauge : 0,
        alive: co.alive ?? true,
        skillCooldowns: { ...(co.skillCooldowns ?? {}) },
      };
    }
    // Fresh battle (no carry) — leave hp/mp undefined so the replay viewer
    // starts the unit at full HP/MP via makeCombatant defaults.
    return {
      templateId: p.template.id,
      classId: prog.classId,
      level: prog.level,
      customStats: { ...prog.customStats },
      equippedSkills,
    };
  });
}

function shouldShowPostButtons(b: Battle): boolean {
  // Run summary panel handles all post-battle navigation now.
  // Keep the action panel populated only while combat is ongoing.
  if (b.state.kind === "ticking") return true;
  return false;
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
      damageDealt: c.damageDealt,
      damageTaken: c.damageTaken,
      kills: c.kills,
      xpGainedTotal: c.xpGainedTotal,
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
  const realDt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;
  // Slow-mo scaling for floors 31+. Affects gauge fill + actionLock decay so
  // animations and turn cadence both stretch proportionally to the CSS slowdown.
  const dt = isSlowMoStage() ? realDt * SLOWMO_FACTOR : realDt;

  if (screen === "replay" && battle) {
    if (battle.state.kind === "ticking") {
      injectReplayActions(battle);
      tick(battle, dt);
    }
    const aliveNow = battle.combatants.filter(c => c.alive).length;
    if (battle.state.kind !== lastStateKind || battle.combatants.length !== lastCombatantCount || aliveNow !== lastAliveCount) {
      renderBattle(root!, battle, () => undefined, () => showLeaderboard(), {
        showPostBattleButtons: false,
        slowMo: isSlowMoStage(),
      });
      lastStateKind = battle.state.kind;
      lastCombatantCount = battle.combatants.length;
      lastAliveCount = aliveNow;

      // Multi-floor: when this battle resolves to a win and the recording has
      // more floors, auto-advance after a short pause so the viewer sees the
      // Victory banner before the next floor loads.
      if (battle.state.kind === "victory" && replayPlayer && replayPlayer.hasMoreBattles()) {
        setTimeout(() => {
          if (screen !== "replay" || !replayPlayer) return;
          replayPlayer.advanceBattle();
          loadReplayBattle();
        }, 1200);
      }
    } else {
      updateLive(root!, battle);
    }
  }

  if (screen === "battle" && battle) {
    if (battle.state.kind === "ticking") tick(battle, dt);

    // Record clears + handle survival advancement once per battle conclusion.
    if (!battleConcluded && battle.state.kind === "victory") {
      battleConcluded = true;
      if (mode === "floor" && !recordedThisBattle) {
        recordClear(currentStageId);
        const elapsed = floorBattleStartedAt > 0 ? Date.now() - floorBattleStartedAt : 0;
        const replay = currentStageId === 50 ? finalizeReplay() : null;
        if (currentStageId !== 50) abortRecording();
        void reportFloorCleared(
          currentStageId,
          currentStageId === 50 ? elapsed : undefined,
          replay ?? undefined,
        );
        recordedThisBattle = true;
        const cleared = currentStageId;
        setTimeout(() => { void showRunSummary("victory", cleared); }, 1500);
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
          // Brief delay so the Victory banner reads before the summary.
          const cleared = STAGE_DEFS.length;
          setTimeout(() => { void showRunSummary("victory", cleared); }, 1500);
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
          const cleared = brIndex;
          setTimeout(() => { void showRunSummary("victory", cleared); }, 1500);
        }
      }
    }

    if (!battleConcluded && battle.state.kind === "defeat") {
      battleConcluded = true;
      // No replay save on defeat — only personal-best clears get recorded.
      abortRecording();
      if (mode === "survival" || mode === "boss_raid") {
        const cleared = mode === "survival" ? Math.max(0, survivalFloor - 1) : brIndex;
        setTimeout(() => { void showRunSummary("defeat", cleared); }, 1800);
      } else if (mode === "floor") {
        const cleared = currentStageId;
        setTimeout(() => { void showRunSummary("defeat", cleared); }, 1800);
      }
      // Persisted by combat.ts already.
    }

    const aliveNow = battle.combatants.filter(c => c.alive).length;
    if (battle.state.kind !== lastStateKind || battle.combatants.length !== lastCombatantCount || aliveNow !== lastAliveCount) {
      renderBattle(root!, battle, handleAction, onPostBattle, { showPostBattleButtons: shouldShowPostButtons(battle), slowMo: isSlowMoStage() });
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
