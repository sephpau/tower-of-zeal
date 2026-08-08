using System.IO;
using UnityEditor;
using UnityEngine;

// Headless visual check for the homepage showcase: spawns ego + captain
// exactly the way EgoShowcase places them (camera at origin, holders at
// Depth facing camera-forward) and renders one PNG. Lets the model
// orientation be verified without a WebGL build or a human.
public static class ShowcaseShot
{
    public static void Shot()
    {
        UnityEditor.SceneManagement.EditorSceneManager.NewScene(
            UnityEditor.SceneManagement.NewSceneSetup.EmptyScene,
            UnityEditor.SceneManagement.NewSceneMode.Single);

        var camGo = new GameObject("cam");
        var cam = camGo.AddComponent<Camera>();
        cam.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.045f, 0.02f, 0.13f);
        cam.fieldOfView = 60f;

        SpawnLikeShowcase("ego", new Vector3(-2.4f, 0f, 6.5f), 2.6f);
        SpawnLikeShowcase("captain", new Vector3(2.4f, 0f, 6.5f), 2.75f);

        var sun = new GameObject("sun").AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.transform.rotation = Quaternion.Euler(35f, -25f, 0f);
        sun.intensity = 1.4f;
        var fill = new GameObject("fill").AddComponent<Light>();
        fill.type = LightType.Point;
        fill.transform.position = new Vector3(0f, 2f, 3f);
        fill.intensity = 2f;
        fill.range = 15f;

        var rt = new RenderTexture(1280, 720, 24);
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(1280, 720, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
        tex.Apply();
        File.WriteAllBytes(@"D:\Claude files\neon-void\showcase-shot.png", tex.EncodeToPNG());
        Debug.Log("ShowcaseShot written");
        EditorApplication.Exit(0);
    }

    static void SpawnLikeShowcase(string resource, Vector3 pos, float size)
    {
        var holder = new GameObject(resource + "Holder");
        holder.transform.position = pos;
        holder.transform.rotation = Quaternion.LookRotation(Vector3.forward, Vector3.up);
        EgoModel.Spawn(holder.transform, Vector3.zero, size, resource);
    }
}
