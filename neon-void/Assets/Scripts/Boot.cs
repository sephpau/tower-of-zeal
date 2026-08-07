using UnityEngine;

// The scene contains only a camera (with post-processing) and this Boot
// object. Everything else — ship, sky, asteroid field, HUD, audio — is
// constructed here at runtime.
public class Boot : MonoBehaviour
{
    void Start()
    {
        Application.targetFrameRate = 120;
        SfxSynth.BuildAll();

        var gmGo = new GameObject("GameManager");
        var gm = gmGo.AddComponent<GameManager>();

        var dressing = gmGo.AddComponent<SpaceDressing>();
        dressing.Build(Camera.main != null ? Camera.main.transform : transform);

        var field = gmGo.AddComponent<AsteroidField>();
        field.Build();

        var ship = PlayerShipFactory.Build(Vector3.zero);

        var cam = Camera.main;
        if (cam != null)
        {
            var chase = cam.GetComponent<ChaseCamera>();
            if (chase == null) chase = cam.gameObject.AddComponent<ChaseCamera>();
            chase.target = ship.transform;
            cam.transform.position = ship.transform.position + new Vector3(0, 2.4f, -8.5f);
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.045f, 0.02f, 0.13f);
            cam.farClipPlane = 8000f;
            cam.allowHDR = true;
        }

        var waves = gmGo.AddComponent<WaveDirector>();

        var hudGo = new GameObject("HUD");
        var hud = hudGo.AddComponent<HudController>();
        hud.Build();

        gm.Init(ship.GetComponent<Health>(), waves, hud);

        if (cam != null) EgoShowcase.Create(cam);
    }
}
