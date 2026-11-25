#!/usr/bin/env bash
# Downloads the textures, HDR skies and 3D models used by build_rooms.py into tools/rooms/assets/
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)/assets"; mkdir -p "$D"; cd "$D"
R=https://raw.githubusercontent.com
for f in hardwood2_diffuse.jpg hardwood2_bump.jpg hardwood2_roughness.jpg terrain/grasslight-big.jpg brick_diffuse.jpg brick_bump.jpg; do
  curl -sfL -o "$(basename $f)" "$R/mrdoob/three.js/dev/examples/textures/$f"; done
for h in forest_slope rooitou_park; do curl -sfL -o "$h.hdr" "$R/pmndrs/drei-assets/master/hdri/${h}_1k.hdr"; done
for m in GlamVelvetSofa SheenChair ChairDamaskPurplegold DiffuseTransmissionPlant GlassVaseFlowers SpecularSilkPouf; do
  curl -sfL -o "$m.glb" "$R/KhronosGroup/glTF-Sample-Assets/main/Models/$m/glTF-Binary/$m.glb"; done
echo "assets in $D"
