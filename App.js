import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { WebView } from "react-native-webview";

const origin = "https://almap.hata6502.com";

export default App = () => {
  const [location, setLocation] = useState();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocation(null);
        return;
      }

      setLocation(await Location.getCurrentPositionAsync());
    })();
  }, []);

  return location !== undefined && <Almap location={location} />;
};

const Almap = ({ location }) => {
  const ref = useRef(null);

  const uri = `${origin}/?${new URLSearchParams({
    ...(location && {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    }),
  })}`;

  const handleMessage = async (event) => {
    const message = JSON.parse(event.nativeEvent.data);

    switch (message.type) {
      case "start": {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          BackHandler.exitApp();
          return;
        }

        ref.current.postMessage(
          JSON.stringify({ type: "progress", progress: 0 })
        );

        let pagedInfo;
        let assetIndex = 0;
        do {
          pagedInfo = await MediaLibrary.getAssetsAsync({
            after: pagedInfo?.endCursor,
            createdAfter: message.after,
            mediaType: "photo",
            sortBy: [[MediaLibrary.SortBy.creationTime, true]],
          });
          console.log("cursor", pagedInfo.endCursor);

          for (const asset of pagedInfo.assets) {
            try {
              ref.current.postMessage(
                JSON.stringify({
                  type: "progress",
                  progress: (assetIndex + 1) / pagedInfo.totalCount,
                })
              );
              assetIndex++;

              const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
              if (!assetInfo.location) {
                continue;
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

              ref.current.postMessage(
                JSON.stringify({
                  type: "importPhoto",
                  id: assetInfo.id,
                  dataURL: `data:image/jpeg;base64,${imageResult.base64}`,
                  location: assetInfo.location,
                  creationTime: assetInfo.creationTime,
                })
              );
              console.log("ID", assetInfo.id);
            } catch (exception) {
              console.error(exception);
            }
          }
        } while (pagedInfo.hasNextPage);

        ref.current.postMessage(JSON.stringify({ type: "progress" }));
        break;
      }
    }
  };

  return (
    <WebView
      ref={ref}
      source={{ uri }}
      originWhitelist={[origin]}
      onMessage={handleMessage}
    />
  );
};
