# devbook

## roadmap

### [v1.0]

- [ ] (F) messurement of site visits and where they come from (nftables)
- [x] (F) register domain
- [x] (F) workflow on github and github pages
- [x] (I) logo and favicon change to garry
- [x] (F) create whispered garry shortcode
- [x] (F) cookie banner vanilla without jquery and other scripts

## [v1.1]

- own theme only with < 80kb size transfered -> [minimal](https://retrolog.io/blog/creating-a-hugo-theme-from-scratch/)
  - serverside highilghting
  - increase font size
  - change layout: wider code space
  - very simple css
  - no js, no cookies
  - use this [font](https://j3s.sh/thought/my-deployment-platform-is-a-shell-script.html)

### change

- posts: short ones, dates at the end (not so visible), sorting number (id)

### add

- web log: add interesting links per year: title: short description, tags

## posts

- multipath routing
- gluetun article
- traffic control and ratelimit
- wg mtu
- article: linux sockets
- stun protocol (signal)
- nixos on omnia 6
- geoip db how it works, can i implement myself?
- tun/tap/dummy interfaces
- mirror port over tun/tap or socket
- minimal tech startup you need only 10$
- how i set up nix secrets
- write down acutal dev practices: seperate page on website with the very important ones
- high documentation, low meeting culture
- rust errors post
- nixos with unbound article

```txt
unshare -r -n
ip link add name dummy0 type dummy
```

- interface groups: ip link set dev interface group 99
- iifgroup
- things you can do with iperf3
