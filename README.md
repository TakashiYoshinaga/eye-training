# Eye Training WebXR

Meta Quest Browserで動かすWebXR視力トレーニング実験アプリです。

本アプリは、下記の参考論文の内容を検証するために再現した実装です。引用元の研究内容を尊重し、学術的な検証を目的としたものです。

GitHub Pages:

- https://takashiyoshinaga.github.io/eye-training/

参考論文:
- https://www.interaction-ipsj.org/proceedings/2025/data/pdf/3B-50.pdf

## What it implements

- 6m x 5m x 34m相当のVRトレーニング空間
- 3レーン上を手前へ迫るランドルト環ターゲット
- トリガーでレーザーポインターを表示
- スティック上下左右でランドルト環の切れ目方向を回答
- Hit / Combo / Miss、レベル、スコア、3分間トレーニング
- 75mmランドルト環と距離に基づく小数視力目安表示

## Run locally

```bash
python3 -m http.server 5173
```

Desktop preview:

```text
http://localhost:5173/
```

Meta QuestでVRとして起動する場合、WebXRにはHTTPSの安全なコンテキストが必要です。GitHub PagesのURLをQuest Browserで開いてください。

## Controls

- Quest: コントローラーでターゲットを狙い、トリガーを押しながらスティックを上下左右に倒す
- Desktop preview: マウスで狙い、矢印キーまたはWASDで回答
- Space: トレーニング開始

## Safety note

これは研究内容を参考にしたWebXR実装であり、医療効果を保証するものではありません。眼疾患、痛み、めまい、疲労、不調がある場合は使用を中止し、専門家に相談してください。
