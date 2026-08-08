using UnityEngine;
using UnityEngine.SceneManagement;

public class GameManager : MonoBehaviour
{
    public static GameManager I { get; private set; }
    public bool Running { get; private set; }

    public int score;
    public int combo;
    public int best;

    // Zeal Survivors layer
    public int xpLevel = 1;
    public int xp;
    public bool Paused { get; private set; }
    SkillSystem _skills;

    float _comboTimer;
    Health _playerHealth;
    WaveDirector _waves;
    HudController _hud;
    AudioSource _sfx2d, _music;

    const string BestKey = "neon-void-best";

    void Awake()
    {
        I = this;
        best = PlayerPrefs.GetInt(BestKey, 0);
    }

    public void Init(Health playerHealth, WaveDirector waves, HudController hud)
    {
        _playerHealth = playerHealth;
        _waves = waves;
        _hud = hud;
        _playerHealth.OnDeath += OnPlayerDeath;
        _playerHealth.OnDamaged += (_, __) => _hud.PulseShield();

        _sfx2d = gameObject.AddComponent<AudioSource>();
        _sfx2d.spatialBlend = 0f;
        _music = gameObject.AddComponent<AudioSource>();
        _music.spatialBlend = 0f;
        _music.clip = SfxSynth.Music;
        _music.loop = true;
        _music.volume = 0.34f;

        _hud.ShowStart();
    }

    float _elapsed;
    int _sigilIdx;
    bool _overtimeAnnounced;
    float _eliteTimer;
    const float EliteEvery = 90f;   // v1 elite cadence

    public void StartRun(int pilotIndex)
    {
        _sigilIdx = 0;
        _overtimeAnnounced = false;
        _eliteTimer = EliteEvery;
        var actsReset = _playerHealth.GetComponent<ActiveSkills>();
        if (actsReset != null) actsReset.ResetAll();
        Running = true;
        score = 0;
        combo = 0;
        xpLevel = 1;
        xp = 0;
        _elapsed = 0f;
        if (TournamentMode.Active)
            Random.InitState(unchecked((int)TournamentMode.Seed));
        _skills = _playerHealth.GetComponent<SkillSystem>();
        _skills.InitPilot(ZealData.Pilots[Mathf.Clamp(pilotIndex, 0, ZealData.Pilots.Length - 1)]);
        var tint = _playerHealth.GetComponent<ShipTint>();
        if (tint != null) tint.Apply(_skills.pilot.accent);
        var special = _playerHealth.GetComponent<SpecialAttack>();
        if (special != null) special.Init(_skills.pilot);
        _music.Play();
        _waves.Begin();
        _hud.ShowGameHud();
        Cursor.visible = false;
        Cursor.lockState = CursorLockMode.Locked;
        _hud.WaveBanner(TournamentMode.Active
            ? "BLITZ // " + TournamentMode.MatchCode + " // " + _skills.pilot.name.ToUpperInvariant()
            : _skills.pilot.name.ToUpperInvariant() + " — " + _skills.pilot.title.ToUpperInvariant());
    }

    public void GainXp(int amount)
    {
        if (!Running) return;
        float tournamentBonus = TournamentMode.Active ? TournamentMode.XpBonus : 1f;
        int gained = Mathf.Max(1, Mathf.RoundToInt(amount * _skills.XpMult * tournamentBonus));
        if (xpLevel >= ZealData.MaxLevel) { score += gained * 5; return; }   // capped: xp becomes score
        xp += gained;
        PlaySfx(SfxSynth.Pickup, 0.15f);
        while (xpLevel < ZealData.MaxLevel && xp >= ZealData.XpToNext(xpLevel))
        {
            xp -= ZealData.XpToNext(xpLevel);
            xpLevel++;
            OpenLevelUp();
        }
    }

    void OpenLevelUp()
    {
        var acts = _playerHealth.GetComponent<ActiveSkills>();
        var choices = LevelUpChoices.Generate(xpLevel, _skills, acts, TournamentMode.Active ? TournamentMode.DraftRng(xpLevel) : null);
        if (choices.Count == 0) { score += 300; return; }
        Paused = true;
        Time.timeScale = 0f;
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
        PlaySfx(SfxSynth.WaveUp, 0.6f);
        _hud.ShowLevelUp(xpLevel, choices, choice =>
        {
            choice.Apply(_skills);
            Paused = false;
            Time.timeScale = 1f;
            if (Running)
            {
                Cursor.visible = false;
                Cursor.lockState = CursorLockMode.Locked;
            }
        });
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.M))
            AudioListener.volume = AudioListener.volume > 0f ? 0f : 1f;

        if (_music != null) _music.volume = 0.34f * GameSettings.MusicVolume;

        if (!Running)
        {
            if ((Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.Space)) && _hud != null && _hud.WantsRestart)
            {
                Time.timeScale = 1f;
                SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
            }
            return;
        }

        if (combo > 0)
        {
            _comboTimer -= Time.deltaTime;
            if (_comboTimer <= 0f) { combo = 0; _hud.SetCombo(0); }
        }

        // boss waves bring in the v1 drum layer
        if (_music != null)
        {
            var want = _waves.bossHealth != null ? SfxSynth.MusicBoss : SfxSynth.Music;
            if (_music.clip != want) { _music.clip = want; _music.Play(); }
        }

        _elapsed += Time.deltaTime;

        // Zeal Sigil grows on the run clock
        var weapon = _playerHealth.GetComponent<Weapon>();
        while (_sigilIdx < ZealData.SigilTimes.Length && _elapsed >= ZealData.SigilTimes[_sigilIdx])
        {
            _sigilIdx++;
            if (weapon != null) weapon.sigilLevel = 1 + _sigilIdx;
            _hud.WaveBanner("ZEAL SIGIL LV " + (1 + _sigilIdx));
            PlaySfx(SfxSynth.Pickup, 0.9f);
        }

        // elite hunter roams in every 90 seconds, independent of waves
        _eliteTimer -= Time.deltaTime;
        if (_eliteTimer <= 0f)
        {
            _eliteTimer = EliteEvery;
            Vector3 dir = Random.onUnitSphere;
            dir.y *= 0.5f;
            EnemyFactory.BuildElite(_playerHealth.transform.position + dir.normalized * Random.Range(130f, 170f), CurrentWave());
            _hud.WaveBanner("!! ELITE HUNTER !!");
            PlaySfx(SfxSynth.BigBoom, 0.5f);
        }

        if (TournamentMode.Active)
        {
            float left = TournamentMode.Duration - _elapsed;
            _hud.SetTimer(left);
            if (!_overtimeAnnounced && left <= TournamentMode.Overtime)
            {
                _overtimeAnnounced = true;
                _hud.WaveBanner("!! OVERTIME !!");
                PlaySfx(SfxSynth.WaveUp, 1f);
            }
            if (left <= 0f) EndTournament("TIME!");
        }

        _hud.Tick(_playerHealth, _waves, score);
    }

    void EndTournament(string reason)
    {
        if (!Running) return;
        Running = false;
        _music.Stop();
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
        int t = Mathf.RoundToInt(Mathf.Min(_elapsed, TournamentMode.Duration));
        string verify = TournamentMode.VerifyCode(score, t);
        TournamentMode.RecordResult(score, t);
        var standings = TournamentMode.LoadStandings();
        _hud.ShowTournamentResults(reason, score, verify, TournamentMode.MatchCode, standings);
        TournamentMode.Disarm();
    }

    public void EnemyKilled(int baseScore, Vector3 where)
    {
        if (!Running) return;
        combo++;
        _comboTimer = 5f;
        int mult = 1 + Mathf.Min(7, combo / 4);
        float greed = _skills != null ? _skills.GreedMult : 1f;
        score += Mathf.RoundToInt(baseScore * mult * greed);
        _hud.SetCombo(mult >= 2 ? mult : 0);
        _hud.ScorePopup(Mathf.RoundToInt(baseScore * mult * greed), where);
        XpOrb.Drop(where, Mathf.Clamp(baseScore / 40, 1, 10));
    }

    public void OnWaveStarted(int wave)
    {
        _hud.WaveBanner(wave > WaveDirector.FinalWave
            ? "SURVIVAL WAVE " + wave
            : "WAVE " + wave + " / " + WaveDirector.FinalWave);
        PlaySfx(SfxSynth.WaveUp, 0.8f);
    }

    // campaign only: the Dreadnought falls and the endless horde begins
    public void OnSurvivalStart()
    {
        score += 2500;
        _hud.WaveBanner("SECTOR CLEARED — SURVIVAL MODE!");
        PlaySfx(SfxSynth.WaveUp, 1f);
        PlaySfx(SfxSynth.Pickup, 0.8f);
    }

    public void OnBossWave(string banner, string taunt = null)
    {
        _hud.WaveBanner(banner);
        PlaySfx(SfxSynth.WaveUp, 1f);
        PlaySfx(SfxSynth.BigBoom, 0.6f);
        if (!string.IsNullOrEmpty(taunt)) StartCoroutine(TauntLater(taunt));
    }

    System.Collections.IEnumerator TauntLater(string taunt)
    {
        yield return new WaitForSeconds(2.3f);
        if (Running) _hud.WaveBanner("“" + taunt + "”");
    }

    public int CurrentWave() => _waves != null ? _waves.wave : 1;
    public void RegisterSummon(GameObject enemy) => _waves.RegisterSummon(enemy);
    public void BossDown() { _waves.ClearBoss(); _waves.HostileDown(); }

    public void OnWaveCleared(int wave)
    {
        score += 250 * wave;
        _hud.WaveBanner("WAVE " + wave + " CLEAR  +" + (250 * wave));
    }

    public void Victory()
    {
        if (TournamentMode.Active) { EndTournament("SECTOR CLEARED"); return; }
        Running = false;
        _music.Stop();
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
        bool newBest = score > best;
        if (newBest)
        {
            best = score;
            PlayerPrefs.SetInt(BestKey, best);
            PlayerPrefs.Save();
        }
        PlaySfx(SfxSynth.WaveUp, 1f);
        _hud.ShowVictory(score, best, newBest);
    }

    public void CollectPowerup(PowerupType type)
    {
        var weapon = _playerHealth != null ? _playerHealth.GetComponent<Weapon>() : null;
        PlaySfx(SfxSynth.Pickup, 0.9f);
        switch (type)
        {
            case PowerupType.Rapid:
                if (weapon != null) weapon.rapidTimer = Mathf.Max(weapon.rapidTimer, 10f);
                _hud.WaveBanner("RAPID FIRE");
                break;
            case PowerupType.ShieldCell:
                _playerHealth.shield = Mathf.Min(_playerHealth.maxShield, _playerHealth.shield + 40f);
                _playerHealth.hull = Mathf.Min(_playerHealth.maxHull, _playerHealth.hull + 10f);
                _hud.WaveBanner("SHIELD RESTORED");
                break;
        }
    }

    void OnPlayerDeath(Health h)
    {
        ExplosionFactory.Explode(h.transform.position, new Color(0.4f, 0.9f, 1f), 2.5f, true);
        PlaySfx(SfxSynth.BigBoom);
        h.gameObject.SetActive(false);
        if (TournamentMode.Active) { EndTournament("SHIP DESTROYED"); return; }
        Running = false;
        _music.Stop();
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;

        bool newBest = score > best;
        if (newBest)
        {
            best = score;
            PlayerPrefs.SetInt(BestKey, best);
            PlayerPrefs.Save();
        }
        _hud.ShowGameOver(score, best, newBest, _waves.wave);
    }

    public void FlashDamage() => _hud.FlashDamage();

    public void ShowDamage(float amount, Vector3 worldPos)
    {
        if (Running && _hud != null) _hud.DamagePopup(Mathf.Max(1, Mathf.RoundToInt(amount)), worldPos);
    }

    public void PlaySfx(AudioClip clip, float vol = 1f)
    {
        if (clip != null && _sfx2d != null) _sfx2d.PlayOneShot(clip, vol * GameSettings.SfxVolume);
    }

    public void PlaySfxAt(AudioClip clip, Vector3 pos, float vol = 1f)
    {
        if (clip == null) return;
        AudioSource.PlayClipAtPoint(clip, pos, vol * GameSettings.SfxVolume);
    }
}
