using UnityEngine;
using UnityEngine.SceneManagement;

public class GameManager : MonoBehaviour
{
    public static GameManager I { get; private set; }
    public bool Running { get; private set; }

    public int score;
    public int combo;
    public int best;

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

    public void StartRun()
    {
        Running = true;
        score = 0;
        combo = 0;
        _music.Play();
        _waves.Begin();
        _hud.ShowGameHud();
        Cursor.visible = false;
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.M))
            AudioListener.volume = AudioListener.volume > 0f ? 0f : 1f;

        if (!Running)
        {
            if ((Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.Space)) && _hud != null && _hud.WantsRestart)
                SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
            else if ((Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.Space)) && _hud != null && _hud.WantsStart)
                StartRun();
            return;
        }

        if (combo > 0)
        {
            _comboTimer -= Time.deltaTime;
            if (_comboTimer <= 0f) { combo = 0; _hud.SetCombo(0); }
        }
        _hud.Tick(_playerHealth, _waves, score);
    }

    public void EnemyKilled(int baseScore, Vector3 where)
    {
        if (!Running) return;
        combo++;
        _comboTimer = 5f;
        int mult = 1 + Mathf.Min(7, combo / 4);
        score += baseScore * mult;
        _hud.SetCombo(mult >= 2 ? mult : 0);
        _hud.ScorePopup(baseScore * mult, where);
    }

    public void OnWaveStarted(int wave)
    {
        _hud.WaveBanner("WAVE " + wave);
        PlaySfx(SfxSynth.WaveUp, 0.8f);
    }

    public void OnWaveCleared(int wave)
    {
        score += 250 * wave;
        _hud.WaveBanner("WAVE " + wave + " CLEAR  +" + (250 * wave));
    }

    void OnPlayerDeath(Health h)
    {
        Running = false;
        _music.Stop();
        Cursor.visible = true;
        ExplosionFactory.Explode(h.transform.position, new Color(0.4f, 0.9f, 1f), 2.5f, true);
        PlaySfx(SfxSynth.BigBoom);
        h.gameObject.SetActive(false);

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

    public void PlaySfx(AudioClip clip, float vol = 1f)
    {
        if (clip != null && _sfx2d != null) _sfx2d.PlayOneShot(clip, vol);
    }

    public void PlaySfxAt(AudioClip clip, Vector3 pos, float vol = 1f)
    {
        if (clip == null) return;
        AudioSource.PlayClipAtPoint(clip, pos, vol);
    }
}
