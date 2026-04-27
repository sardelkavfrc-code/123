{
  "outbounds": [
    {
      "type": "selector",
      "tag": "proxy",
      "outbounds": [
        "Best Latency",
        "🇩🇪 Германия Wi-Fi",
        "🇩🇪 Германия LTE Wi-Fi"
      ],
      "interrupt_exist_connections": true
    },
    {
      "type": "urltest",
      "tag": "Best Latency",
      "outbounds": [
        "🇩🇪 Германия Wi-Fi",
        "🇩🇪 Германия LTE Wi-Fi"
      ]
    },
    {
      "type": "direct",
      "tag": "direct"
    },
    {
      "type": "block",
      "tag": "block"
    },
    {
      "type": "dns",
      "tag": "dns-out"
    },
    {
      "type": "vless",
      "tag": "🇩🇪 Германия Wi-Fi",
      "server": "92.246.139.121",
      "server_port": 8443,
      "uuid": "6c6ceb7f-1be0-447a-8160-45373be8486a",
      "flow": "xtls-rprx-vision",
      "tls": {
        "enabled": true,
        "server_name": "www.heise.de",
        "alpn": [
          "h2",
          "http/1.1"
        ],
        "utls": {
          "enabled": true,
          "fingerprint": "chrome"
        },
        "reality": {
          "enabled": true,
          "public_key": "2l7xaqgMJZhzfRRfjKm6HzquXHJlovENADG14lkhNiI",
          "short_id": "61b424"
        }
      },
      "multiplex": {
        "protocol": "h2mux",
        "max_streams": 8
      }
    },
    {
      "type": "vless",
      "tag": "🇩🇪 Германия LTE Wi-Fi",
      "server": "195.209.208.134",
      "server_port": 443,
      "uuid": "6c6ceb7f-1be0-447a-8160-45373be8486a",
      "flow": "xtls-rprx-vision",
      "tls": {
        "enabled": true,
        "server_name": "web.max.ru",
        "utls": {
          "enabled": true,
          "fingerprint": "chrome"
        },
        "reality": {
          "enabled": true,
          "public_key": "2l7xaqgMJZhzfRRfjKm6HzquXHJlovENADG14lkhNiI",
          "short_id": "b98296"
        }
      },
      "multiplex": {
        "protocol": "h2mux",
        "max_streams": 8
      }
    }
  ]
}
