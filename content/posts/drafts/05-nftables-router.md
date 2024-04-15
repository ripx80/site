---
author: "ripx80"
title: "nftables - advacned router"
linktitle: "nftables router"
description: "configure a nixos system as a router based on nftables"
date: 2024-04-15
draft: true
tags:
  - network
  - security
  - nix
keywords:
  - network
  - security
  - nix
weight: 0
---

## short

this post will get some advanced rules to configure a nixos system as a wg router and is based on the previous post nftables.
need additional ideas or use cases? take a look at (50 things to do with nftables) post.

### context

- system: x86_64
- kernel: 6.7.9
- nixos: 23.11
- nftables: 1.0.9

nixos modules:

- [firewall](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall.nix)
- [firewall-nftables](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall-nftables.nix)
- [nftables](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/nftables.nix)

## nat

network address translation ([nat](https://wiki.nftables.org/wiki-nftables/index.php/Performing_Network_Address_Translation_(NAT))) will allow you to route packets to different networks.
i will use this to allow my wireguard clients the connection to the outside world via eth0, so you can build your own vpn server with masquerading.
the first step is to enable packet forwarding in the kernel.

```sh
sysctl --system
net.ipv4.conf.all.forwarding = 1
net.ipv4.conf.default.forwarding = 1
```

in nixos you can do that by set this via sysctl.

```nix
boot.kernel.sysctl = {
  "net.ipv4.conf.all.forwarding" = true;
  "net.ipv4.conf.default.forwarding" = true;
};
```

normaly nixos has an option for that ```nix networking.nat.enable = true;``` but this will accept all forwarded packets to every network interface.
you can change this behavoir with ```nix networking.firewall.filterForward```.
this will create a **forward** and **forward-allow** chain but i will use the```nix networking.nftables.ruleSet``` to set the rules in one place.

to route internal traffic (wg0) to the outside (eth0) you need two tables: **nat** and **forward**.
here are the nft rules to enable a simple source nat with masquerading from wg0 to eth0. All addresses in this network will be forwarded.

```nix
nftables = {
    enable = true;
    flushRuleset = true; # flush all tables on reload
    # rules are addaptive with nixos-fw.
    # if you have a table this rules will added or change the ruleset like the default policy of a chain.
    ruleset = ''
    # the nat table will configure how packages are translated (srcnat, dstnat, aso)
    table ip nat {
        chain postrouting {
        # this will add the srcnat postrouting hook
        type nat hook postrouting priority srcnat; policy accept;
        # input interface is the internal wireguard network wg0.
        # output interface is eth0 which is connected to the internet.
        # the source nat will be masquerade, only the ip address of your router will shown to the outside
        iifname "wg0" oifname "eth0" masquerade comment "from internal interfaces"
        }
    }

    table ip filter {
        # need a forward chain to forward incomming packets
        chain forward {
            type filter hook forward priority 0; policy drop;
            # only new connections from wg0 to eth0 forwarding are accepted
            iifname "wg0" oifname "eth0" accept comment "only from wg0 to internet"
            # you need the reverse path for your packages, so only allow related and ethablished packts from the internet
            iifname "eth0" oifname "wg0" ct state related,established accept comment "allow responses from internet"
    }
    '';
  };
};
```

But if you have some special clients they should be forwarded and all others are in prision inside your wg network you can add these specific ip addresses to a allow list instead of allow all clients this privilege.

```nft
 table ip filter {
    chain forward {
        # disable "all" forwarding rule
        # iifname "wg0" oifname "eth0" accept comment "only from wg0 to internet"
        # add source address to forward
        ip saddr { 192.168.1.2, 192.168.1.3, 192.168.1.43 } oifname "eth0" accept comment "only specified source ip to internet"
        iifname "wg0" oifname "wg0" jump wg-forward
    }
 }
```

### wg restrictions

maybe you will restrict clients inside your wireguard network to talk to each other or to be explicit do the initial connection.
the following ruleset will allow the ip address 192.168.1.2 etablish a new connection to ip addresses 192.168.1.3 and 192.168.1.43.
192.168.1.3 can only etablish a new connection to .43.
The vmap on the beginning take care of the response, etablished and related are accepted.
if you want to read more in detail informations about [verdict map](https://wiki.nftables.org/wiki-nftables/index.php/Verdict_Maps_(vmaps)).

```nft
chain wg-forward {
    # here the state will be set in a vmap
    ct state vmap { invalid : drop, established : accept, related : accept }
    ip saddr 192.168.1.2 ip daddr { 192.168.1.3, 192.168.1.43 } accept
    ip saddr 192.168.1.3 ip daddr { 192.168.1.2 } accept
}
```

## logging traffic

sometimes you will log important connections in your logging system like ssh login attemps.
we use the default **nixos-fw** table to log a new incomming ssh connection.
this will log all new ssh connections in your kernel log.

```nft
table inet nixos-fw {
    chain input-allow {
        tcp dport 22 ct state new log prefix "[nftables] new ssh accepted: " accept comment "allow and log ssh"
    }
}
```

or if you want to use the command line to add this rule, use the nft cmd.

```sh
nft add rule inet nixos-fw input-allow tcp dport 22 ct state new log prefix \"[nftables] new ssh accepted: \" accept comment "allow and log ssh"
```

normaly this logs are send to journald on most linux distributions and you can inspect these logs via journalctl.
the default priority is **4** for nftables logs if you have not set another priority.

```sh
journalctl -k --priority=4 # show priority level 4 like nftables
```

when you connected to the internet you will see a lot of login attempts to your ssh port. yes we a live in a bad world, because bots and scanners try to login or check your open ports.
but we dont have allow ssh on the interface **eth0**, have we? yes you have an accept in this rule and set no interface.
so this will open your ssh service on all interfaces!
but we want to allow ssh etablish new connections only on the internal wg0 network.

```nft
iif "wg0" tcp dport 22 ct state new log prefix "[nftables] new ssh connection: " accept
````

now only ssh connections on the internal wireguard interface "wg0" are allowed. you can verify this in the kernel log or try to connect with a ssh client to eth0 and wg0.

## icmp

its a good idea to rate limit the icmp echo-request (ping) on a machine to prevent ping-floods.

```nft
table inet nixos-fw {
    chain input-allow {
        icmp type echo-request limit rate 10/second accept
    }
}
```

## limits

```nft
     #limit lim_400ppm { rate 400/minute ; comment "limit per packet"}
```

limit ssh connections per ip and counter

```nft
iif $ssh tcp dport 22 meter ssh_meter { ip saddr ct count over 5 } counter drop comment "limit ssh max connections per ip"
```

## flowtables

[flowtables](https://wiki.nftables.org/wiki-nftables/index.php/Flowtables) allow you to accelerate packet forwarding in software (and in hardware if your nic supports it) by using a conntrack-based network stack bypass.
for example you can skip the default flow of rules and use the ingress flow and then redirect directly to the forward chain, too speed up your routing.

on nixos you must disable ```nix networking.nftables.checkRuleset = false;``` because the ruleset checker will not work with flowtables at the [moment](https://discourse.nixos.org/t/nftables-could-not-process-rule-no-such-file-or-directory/33031).

in this example the flow will go from **wg0** to **enp10s0** direct from ingress to forward for tcp and upd traffic.

```nix

 table inet filter {

    flowtable ft {
        hook ingress priority 0
        devices = { wg0, enp10s0 }
    }

    chain forward {
        type filter hook forward priority 0; policy drop;

        # enable flow offloading for better throughput
        ip protocol { tcp, udp } ct state established flow offload @ft counter
    }
}
```

note that when you use flowtables the hooks prerouting and postrouting are bypassed. you canot use a feature like masquerade with this fastpath.
a deep explaination of this topic you can find on this [blog](https://thermalcircle.de/doku.php?id=blog:linux:flowtables_1_a_netfilter_nftables_fastpath) post.

## simple ruleset for a wg router

normaly when i have more advanced ruleset i overwrite all default nixos rules with a ```nix nftables.ruleset``` and ```nft flush ruleset```.
this is a blueprint for a minimal nat wg router to enable routing between wireguard nodes (internal wg0) and the internet (vpn mode).
I use [define](https://wiki.nftables.org/wiki-nftables/index.php/Scripting#:~:text=%22/etc/nftables/*%22-,Defining%20variables,-You%20can%20use) to set variables for a clean ruleset.

if you see ```nix ${meta.ripbox.wg.ip}``` this means that i define the ip and other host related information in one [git-crypt](https://github.com/AGWA/git-crypt) meta.nix file in my repository.

here are some features:

- flush ruleset
- nftables scripting
- named counters
- named limits
- limit max ssh connections from src_ip
- limits max conections in time
- reverse path filtering (default from nixos)
- blocking list (fail2ban replacement)
- log ssh connection to kernel log
- source nat and masquerading (vpn)
- forward specific wireguard clients to each other
- ingress filter to drop bad packages like XMAS, SYN Flood, aso

## todo: use the new if layout from wgpx, add flowtables for wg <-> wg

```nix
firewall.enable = true;
    nftables = {
      enable = true;
      checkRuleset = false;
      ruleset = ''
        # delete all prev rules like nixos default rules
        flush ruleset

        define if_in = wg0
        define if_out = eth0
        define if_wg  = { $if_out }

        define wg_port = ${builtins.toString meta.${config.networking.hostName}.wg.port}
        define ssh = { $if_in }
        define dns = { $if_in }

        define ripbox = ${meta.ripbox.wg.ip}
        define ripmc  = ${meta.ripmc.wg.ip}
        define ripwin = ${meta.ripwin.wg.ip}

        # here i define the internal network with hosts to talk to each other
        define frostnet = { $ripbox, $ripmc, $ripwin }
        # here i define the hosts they can use this server as a vpn router to forward packages to the internet.
        define vpn_allow = { $ripbox, $ripmc, $ripmob }

        table inet fw {

            counter cnt_ssh {
                comment "count ssh packets"
            }

            counter cnt_dns {
                comment "count dns packets"
            }

            counter cnt_dns_tcp {
                comment "count dns over tcp packets"
            }

            limit lim_ssh { rate over 10/minute }
            limit lim_icmp { rate 10/second ; comment "no ping floods"}
            limit lim_dns { rate 150/second ; comment "no dns floods" }

            set deny_v4 { type ipv4_addr ; flags dynamic, timeout ; timeout 5m ; comment "deny list of blocked ip addresses";}

            chain rpfilter {
                type filter hook prerouting priority mangle + 10; policy drop;
                fib saddr . mark . iif oif exists accept comment "reverse path check"
            }

            chain input {
                type filter hook input priority 0; policy drop;
                iif lo accept comment "trusted interfaces"
                ip saddr @deny_v4 drop comment "drop all clients from blocking list"
                icmp type echo-request limit name lim_icmp counter accept comment "No ping floods and allow pings"
                ct state vmap { invalid : drop, established : accept, related : accept, new : jump services, untracked : jump services }
            }

            chain output {
                type filter hook output priority 0; policy drop;
                ct state vmap { invalid : drop, established : accept, related : accept, new : accept, untracked : accept } comment "allow outgoing packages"
            }

            chain services {
                iif $if_wg udp dport $wg_port accept comment "open wg port"

                iif $ssh tcp dport 22 ct state new, untracked limit name lim_ssh update @deny_v4 { ip saddr } comment "limit ssh connection in time to blocking list"
                iif $ssh tcp dport 22 meter ssh_meter { ip saddr ct count over 5 } counter drop comment "limit ssh max connections per ip"
                iif $ssh tcp dport 22 ct state new counter name cnt_ssh log prefix "[nftables] new ssh connection: " accept comment "allow, log, count new ssh connections"

                iif $dns udp dport 53 limit name lim_dns counter name cnt_dns accept comment "limit dns queries on interface"
                iif $dns tcp dport 53 limit name lim_dns counter name cnt_dns_tcp accept comment "limit dns queries on interface"
            }
        }

        table inet nat {
            chain postrouting {
                type nat hook postrouting priority srcnat; policy accept;
                iif $if_in oif $if_out masquerade comment "from internal interfaces"
            }
        }

        table inet vpn {
            chain forward {
                type filter hook forward priority 0; policy drop;
                ct state vmap { invalid : drop, established : accept, related : accept }

                ip saddr { $ripbox, $ripmc, $ripmob } oif $if_out accept comment "only specified source ip to internet"
                iif $if_out oif $if_in ct state related,established accept comment "allow responses from internet"

                iif $if_in oif $if_in jump wg-forward comment "allow internal routing"
            }

            chain wg-forward {
                ip saddr $ripbox ip daddr $frostnet accept
                ip saddr $ripmc ip daddr $frostnet accept
                ip saddr $ripwin ip daddr { $ripmc } accept
            }
        }

        table netdev filter {
            chain ingress {
                type filter hook ingress devices = {$if_in, $if_out} priority -500
                jump ingress_filter
            }

            # Basic filter chain, devices can be configued to jump here
            chain ingress_filter {
                ip frag-off & 0x1fff != 0 counter drop comment "drop all fragments"
                tcp flags fin,psh,urg / fin,psh,urg counter packets 0 bytes 0 drop comment "drop xmas nmap packets"
                tcp flags & (fin|syn|rst|psh|ack|urg) == fin|syn|rst|psh|ack|urg counter drop comment "drop xmas packets"
                tcp flags & (fin|syn|rst|psh|ack|urg) == 0x0 counter drop comment "drop null packets"
                tcp flags syn tcp option maxseg size 1-535 counter drop comment "drop uncommon mss values"
                tcp flags & (fin|syn) == (fin|syn) counter drop comment "drop fin and syn at the same time"
                tcp flags & (syn|rst) == (syn|rst) counter drop comment "drop rst and syn at the same time"
            }
        }
      '';
      };

```

## how to check rules are correct and working?

```sh
ping -t 192.168.1.1 -l 65500 # ping flood

dog -U -n 192.168.1.1 google.de # test udp dns query
dog -T -n 192.168.1.1 google.de # test tcp dns query

ssh 192.168.1.1 # ssh counter and log entry

nft list counters
```

```txt
table inet fw {
    counter cnt_ssh {
        comment "count ssh packets"
        packets 1 bytes 60
    }
    counter cnt_dns {
        comment "count dns packets"
        packets 1 bytes 66
    }
    counter cnt_dns_tcp {
        comment "count dns over tcp packets"
        packets 1 bytes 60
    }
}
```

check for ssh log

```sh
journalctl -k --priority=4 | tail
```

```sh
nmap -sN 192.168.1.1 -p22 # counter increase by two null packets
nmap -sF 192.168.1.1 -p22 # not in counter
nmap -sX 192.168.1.1 -p22 # counter increase by two xmas
nmap -sS --scanflags SYNFIN 192.168.1.1 -p22 # URG, ACK, PSH, RST, SYN, and FIN
# no example found to send uncommon mss values

```

## counting https

```nft
table inet fw {
    set https { type ipv4_addr; flags dynamic; size 65536; timeout 60m; comment "counter per ip https request";}
    chain input {
        type filter hook input priority 0; policy drop;
        tcp dport 443 accept
        ct state new tcp dport 443 update @https { ip saddr counter } comment "count https requests"
    }

}
```

nft list set inet filter https

## learned

- postrouting:
- prerouting:
- masquerade: Masquerade is a special case of SNAT, where the source address is automagically set to the address of the output interface.
- redirect: By using redirect, packets will be forwarded to local machine. Is a special case of DNAT where the destination is the current machine.
- ${pkgs.iproute}/bin/ip link set mtu 1380 dev wg0 # set the mtu of wg0 interface to 1380
- journalctl -f read on the fly, journalctl -k only kernel messages like nftables, journal -k --priority=4 (show priority level 4 like nftables)
- tcpdump -i eth0 host 38.10.10.1 and not port 58432
