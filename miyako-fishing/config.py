"""地点・APIパラメータの共通設定。"""

# 宮古市中心部付近の緯度経度（Open-Meteo等の座標ベースAPI用）
MIYAKO_LAT = 39.6417
MIYAKO_LON = 141.9647

# tide736.net の都道府県コード(pc) 岩手県 (JIS X0401)
TIDE_PC = "03"

# tide736.net の港コード(hc) 宮古
# 本セッションでは tide736.net への外部アクセスがサンドボックスのegressポリシーで
# ブロックされていたため、宮古のhc値を確認できていない。
# https://tide736.net/ の港一覧から宮古のhcを確認し、ここに設定すること。
TIDE_HC = None
