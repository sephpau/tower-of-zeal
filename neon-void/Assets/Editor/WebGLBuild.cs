using UnityEditor;
using UnityEngine;

// Headless WebGL build:
//   Unity.exe -batchmode -quit -projectPath <proj> -buildTarget WebGL
//     -executeMethod WebGLBuild.Build -logFile build.log
// Output: Builds/WebGL (self-contained static site, Brotli + JS fallback
// so any static host works with zero header configuration).
public static class WebGLBuild
{
    [MenuItem("Zeal Survivors/Build WebGL")]
    public static void Build()
    {
        // keep the download lean: cap the big hand-drawn icons at 256px
        foreach (string guid in AssetDatabase.FindAssets("t:Texture2D", new[] { "Assets/Resources/icons" }))
        {
            string path = AssetDatabase.GUIDToAssetPath(guid);
            var imp = AssetImporter.GetAtPath(path) as TextureImporter;
            if (imp != null && imp.maxTextureSize > 256)
            {
                imp.maxTextureSize = 256;
                imp.SaveAndReimport();
            }
        }

        PlayerSettings.WebGL.template = "PROJECT:NeonVoid";   // Assets/WebGLTemplates/NeonVoid
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
        PlayerSettings.WebGL.decompressionFallback = true;   // no server headers needed
        PlayerSettings.runInBackground = true;

        var report = BuildPipeline.BuildPlayer(
            new[] { "Assets/Scenes/NeonVoid.unity" },
            "Builds/WebGL",
            BuildTarget.WebGL,
            BuildOptions.None);

        Debug.Log("WebGL build result: " + report.summary.result +
            ", size: " + (report.summary.totalSize / 1048576) + " MB, errors: " + report.summary.totalErrors);
        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            EditorApplication.Exit(1);
    }
}
