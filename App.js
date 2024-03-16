import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { Alert, AppState, BackHandler } from "react-native";
import base64 from "react-native-base64";
import { WebView } from "react-native-webview";

const origin = "https://almap.hata6502.com";

export default App = () => (
  <>
    <StatusBar backgroundColor="#000" style="light" translucent={false} />
    <Almap />
  </>
);

const Almap = () => {
  const after = useRef(null);
  const appState = useRef(AppState.currentState);
  const webView = useRef(null);

  const importPhotos = async () => {
    if (after.current === null) {
      return;
    }
    const createdAfter = after.current;
    after.current = null;

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      await new Promise((resolve) =>
        Alert.alert(
          "",
          "アルバムへのアクセスが許可されていません。設定から許可してください。",
          [{ onPress: resolve }]
        )
      );
      BackHandler.exitApp();
      return;
    }

    if (!createdAfter) {
      await new Promise((resolve) =>
        Alert.alert(
          "",
          "デバイス内のアルバムを取り込みます。しばらくお待ちください。",
          [{ onPress: resolve }]
        )
      );
    }

    postMessageToWebView({ type: "progress", progress: 0 });

    let assetIndex = 0;
    let latestCreationTime = createdAfter;
    let pagedInfo;
    do {
      pagedInfo = await MediaLibrary.getAssetsAsync({
        after: pagedInfo?.endCursor,
        createdAfter,
        mediaType: "photo",
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
      });
      console.log("cursor", pagedInfo.endCursor);

      await Promise.all(
        pagedInfo.assets.map(async (asset) => {
          try {
            const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
            if (!assetInfo.location) {
              return;
            }

            const imageResult = await ImageManipulator.manipulateAsync(
              assetInfo.localUri,
              [
                {
                  resize:
                    assetInfo.height < assetInfo.width
                      ? { width: 512 }
                      : { height: 512 },
                },
              ],
              { base64: true }
            );

            postMessageToWebView({
              type: "importPhoto",
              id: assetInfo.id,
              dataURL: `data:image/jpeg;base64,${imageResult.base64}`,
              location: assetInfo.location,
              creationTime: assetInfo.creationTime,
            });
            latestCreationTime = assetInfo.creationTime;
            console.log("ID", assetInfo.id);
          } catch (exception) {
            console.error(exception);
          }
        })
      );

      assetIndex += pagedInfo.assets.length;
      postMessageToWebView({
        type: "progress",
        progress: assetIndex / pagedInfo.totalCount,
      });
    } while (pagedInfo.hasNextPage);

    postMessageToWebView({ type: "progress" });
    after.current = latestCreationTime;
  };

  const postMessageToWebView = (message) => {
    webView.current.injectJavaScript(`
      dispatchEvent(
        new CustomEvent("almapwebmessage", {
          detail: JSON.parse(atob("${base64.encode(JSON.stringify(message))}")),
        })
      );
    `);
  };

  const handleMessage = async (event) => {
    const message = JSON.parse(event.nativeEvent.data);

    switch (message.type) {
      case "start": {
        after.current = message.after;
        await importPhotos();
        break;
      }
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          await importPhotos();
        }

        appState.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <WebView
      ref={webView}
      source={{ uri: `${origin}/` }}
      originWhitelist={[origin]}
      onMessage={handleMessage}
    />
  );
};
