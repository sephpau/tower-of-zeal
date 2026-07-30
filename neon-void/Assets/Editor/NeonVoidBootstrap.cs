using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.PostProcessing;

// One-time scene builder. Runs automatically on first project open (or via
// menu Neon Void > Build Game Scene). Creates the scene with a camera +
// post-processing stack (bloom, vignette, chromatic aberration) and the Boot
// object that constructs the rest at runtime.
public static class NeonVoidBootstrap
{
    const string ScenePath = "Assets/Scenes/NeonVoid.unity";

    [InitializeOnLoadMethod]
    static void AutoBuild()
    {
        EditorApplication.delayCall += () =>
        {
            if (!System.IO.File.Exists(ScenePath))
            {
                BuildScene();
                EditorSceneManager.OpenScene(ScenePath);
            }
        };
    }

    [MenuItem("Neon Void/Build Game Scene")]
    public static void BuildScene()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        // camera + post stack
        var camGo = new GameObject("Main Camera");
        camGo.tag = "MainCamera";
        var cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.045f, 0.02f, 0.13f);
        cam.fieldOfView = 62f;
        cam.nearClipPlane = 0.1f;
        cam.farClipPlane = 8000f;
        cam.allowHDR = true;
        camGo.AddComponent<AudioListener>();

        var profile = ScriptableObject.CreateInstance<PostProcessProfile>();
        var bloom = profile.AddSettings<Bloom>();
        bloom.enabled.Override(true);
        bloom.intensity.Override(3.4f);
        bloom.threshold.Override(1.05f);
        bloom.softKnee.Override(0.6f);
        var vig = profile.AddSettings<Vignette>();
        vig.enabled.Override(true);
        vig.intensity.Override(0.32f);
        vig.smoothness.Override(0.45f);
        var ca = profile.AddSettings<ChromaticAberration>();
        ca.enabled.Override(true);
        ca.intensity.Override(0.18f);
        var grain = profile.AddSettings<Grain>();
        grain.enabled.Override(true);
        grain.intensity.Override(0.18f);
        grain.size.Override(1.2f);

        System.IO.Directory.CreateDirectory("Assets/PostFX");
        AssetDatabase.CreateAsset(profile, "Assets/PostFX/NeonVoidProfile.asset");

        var volumeGo = new GameObject("PostFX Volume");
        var volume = volumeGo.AddComponent<PostProcessVolume>();
        volume.isGlobal = true;
        volume.profile = profile;

        var layer = camGo.AddComponent<PostProcessLayer>();
        layer.volumeLayer = ~0;   // all layers — single global volume, no layer bookkeeping
        layer.antialiasingMode = PostProcessLayer.Antialiasing.FastApproximateAntialiasing;

        // boot object builds the rest at runtime
        new GameObject("Boot").AddComponent<Boot>();

        // keep the referenced runtime shaders from being stripped in builds
        System.IO.Directory.CreateDirectory("Assets/Materials");
        CreateKeepAliveMaterial("Standard", "Assets/Materials/KeepStandard.mat");
        CreateKeepAliveMaterial("Legacy Shaders/Particles/Additive", "Assets/Materials/KeepAdditive.mat");
        CreateKeepAliveMaterial("Legacy Shaders/Particles/Alpha Blended", "Assets/Materials/KeepAlphaBlended.mat");
        var keeper = new GameObject("ShaderKeepAlive");
        var mr = keeper.AddComponent<MeshRenderer>();
        mr.sharedMaterials = new[] {
            AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/KeepStandard.mat"),
            AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/KeepAdditive.mat"),
            AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/KeepAlphaBlended.mat"),
        };
        mr.enabled = false;

        System.IO.Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, ScenePath);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        AssetDatabase.SaveAssets();
        Debug.Log("Neon Void: scene built at " + ScenePath + ". Press Play!");
    }

    static void CreateKeepAliveMaterial(string shaderName, string path)
    {
        var shader = Shader.Find(shaderName);
        if (shader == null) return;
        if (AssetDatabase.LoadAssetAtPath<Material>(path) != null) return;
        AssetDatabase.CreateAsset(new Material(shader), path);
    }
}
