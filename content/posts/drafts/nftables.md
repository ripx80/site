# nftables

system: x86_64
kernel: 6.7.9
date: 2024-04
nftables: 1.0.9

nftables is the modern Linux kernel (>= 3.13 nft [support](https://git.netfilter.org/nftables/log/doc?showmsg=1)) packet classification framework to replace iptables.

## short

here you will get the basic and usefull cmd for nftables and some usecases how nftables will configured specialized on nixos systems.
when you will dive deep and get some additional ideas look at (50 things to do with nftables)

## netfilter

The netfilter project enables packet filtering, network address [and port] translation (NA[P]T), packet logging, userspace packet queueing and other packet mangling.

The netfilter hooks are a framework inside the Linux kernel that allows kernel modules to register callback functions at different locations of the Linux network stack. The registered callback function is then called back for every packet that traverses the respective hook within the Linux network stack.

So, netfilter is the Linux framework for manipulating network packets. It can filter and transform packets at predefined points in the kernel.

On top of netfilter sit the firewalls: the venerable iptables, and the new nftables

## nft

some useful commands to interact with nftables and netfilter.
Note that the position of the statements within your rule is significant,
because nftables evaluates expressions and statements linearly from left to right.

```sh
nft --stateless list table filter # list table filter, omit stateful information like counters
nft --stateless list ruleset # list all nft instructions
nft list chains # list all chains
nft -j list ruleset # output json
nft list ruleset -a # get the handle to delte a rule

nft delete rule inet nixos-fw input-allow handle 17 # delete rule in nixos-fw chain input-allow handle 17

nft -c -o -f ruleset.test  #  read the nft file, optimize ruleset in dry-run mode
nft monitor # see live changes on ruleset

# change policy of a chain
nft add ip chain nat PREROUTING '{ policy drop; }' # add chain PREROUTING with default policy drop
nft add chain ip nat POSTROUTING '{ policy accept; }' # add chain nat POSTROUTING with default policy accept
```

## families

nft has different family types to interact with:

- ip: only see ipv4 traffic
- ip6: only see ipv6 traffic
- inet: Tables of this family see both IPv4 and IPv6 traffic/packets, simplifying dual stack support.
- arp: arp level traffic
- bridge:  traffic/packets traversing bridges
- netdev: The netdev family is different from the others in that it is used to create base chains attached to a single network interface. Such base chains see all network traffic on the specified interface, with no assumptions about L2 or L3 protocols.

## nft debugging

with ```sh nft monitor``` you can see live rules changes
todo: more input and examples

```sh
nft monitor
```

## nftrace

todo: more input and examples

```sh
nft monitor trace
```

## nftables with nixos

nixos: 23.11
nixos modules:

- [firewall](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall.nix)
- [firewall-nftables](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/firewall-nftables.nix)
- [nftables](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/modules/services/networking/nftables.nix)

nftables can be enabled with the nixos setting ```nix network.nftables.enable = true;```. This will add the **pkgs.nftables** to your system environment and create a default ruleset for your system.

```nft
# default name nixos-fw, inet is for ipv4 and ipv6 traffic
table inet nixos-fw {
    # chain for reverse path filtering and dhcp
    chain rpfilter {
        # this will change the priority of mangle to 10 and a default chain policy to drop
        type filter hook prerouting priority mangle + 10; policy drop;
        # this will open dhcpv4 on port 68 and 67 bootp
        meta nfproto ipv4 udp sport . udp dport { 68 . 67, 67 . 68 } accept comment "DHCPv4 client/server"
        # check reverse path, see cfg.checkReversePath
        fib saddr . mark . iif oif exists accept
    }
    # default input chain
    chain input {
        # filter with default drop policy
        type filter hook input priority filter; policy drop;
        # lo is a trusted interface, see networking.firewall.trustedInterfaces
        iifname "lo" accept comment "trusted interfaces"
        # track the state of the conntrack, new and untracked will handled in input-allow
        ct state vmap { invalid : drop, established : accept, related : accept, new : jump input-allow, untracked : jump input-allow }
    }
    # allow dhcpv6 without any trusted ports defined in networking.firewall.allowedTCPPorts
    chain input-allow {
        icmpv6 type != { nd-redirect, 139 } accept comment "Accept all ICMPv6 messages except redirects and node information queries (type 139).  See RFC 4890, section 4.4."
        ip6 daddr fe80::/64 udp dport 546 accept comment "DHCPv6 client"
    }
}
```

this is the default ruleset when nftables is enabled on a nixos system.
you can see the function of each instruction in the comments or look into the nixos modules.
other interesting options can find under ```nix network.firewall``:

- logReversePathDrops
- logRefusedConnections
- logRefusedPackets
- logRefusedUnicastsOnly
- rejectPackets
- allowPing
- pingLimit

this is my default configuration without overwrite the entire ruleset and use the nixos modules options:

```nix
networking = {
  firewall = {
      enable = true;
      logRefusedConnections = false;
      logRefusedPackets = false;
      allowPing = false;
      interfaces.eth0 = {
        # my wireguard port ready to connect to the outside world.
        allowedUDPPorts = [ meta.${config.networking.hostName}.wg.port ];
      };
      # on wg only ssh and dns are open
      interfaces.wg0 = {
        allowedTCPPorts = [ 22 53 ];
        allowedUDPPorts = [ 53 ];
      };
    };
};
```

### nat

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

## learned

- [doc](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt):
  Difference between net.ipv4.conf.all.forwarding and net.ipv4.ip_forward.

- sysctl --system shows all system settings without a config file
- ip mangle table: It is basically used to set specific headers for IP packets to affect the routing decision made further on. like mtu or ttl.
- nixos opens automaticly dhcp ipv4 and ipv6 ports when networking.firewall.enable = true.
- nixos networking.firewall.checkReversePath is default true

- postrouting:
- prerouting:
- masquerade: Masquerade is a special case of SNAT, where the source address is automagically set to the address of the output interface.
- redirect: By using redirect, packets will be forwarded to local machine. Is a special case of DNAT where the destination is the current machine.
- netcat host port (tcp connection)
- netcat -u host port (udp connection)
- netcat -z -v domain.com 1-1000 # port scanning
- netcat -l 4444 # listen
- netcat -l 4444 > received_file # files through
- netcat domain.com 4444 < original_file
- printf 'HTTP/1.1 200 OK\n\n%s' "$(cat index.html)" | netcat -l 8888 # http://server_IP:8888
- ${pkgs.iproute}/bin/ip link set mtu 1400 dev wg0
- journalctl -f read on the fly, journalctl -k only kernel messages like nftables, journal -k --priority=4 (show priority level 4 like nftables)
- tcpdump -i eth0 host ip-95-223-229-27.hsi16.unitymediagroup.de and not port 58432

## docs

- [wiki](https://wiki.nftables.org/wiki-nftables/index.php/Main_Page)
- [timeline log](https://git.netfilter.org/nftables/log/doc?showmsg=1) of nft development
- in [10 minutes](https://wiki.nftables.org/wiki-nftables/index.php/Quick_reference-nftables_in_10_minutes)
- [nftables on nixos](https://scvalex.net/posts/54/)
- [flowtables](https://wiki.nftables.org/wiki-nftables/index.php/Flowtables)
- [flowtables kernel](https://docs.kernel.org/networking/nf_flowtable.html)
- [deep explaination of flowtables](https://thermalcircle.de/doku.php?id=blog:linux:flowtables_1_a_netfilter_nftables_fastpath)
- [nixos-home-router](https://francis.begyn.be/blog/nixos-home-router)
- [nixos-router](https://pavluk.org/blog/2022/01/26/nixos_router.html)
- [wireguard nftables](https://www.procustodibus.com/blog/2021/11/wireguard-nftables/)

## todo

- iif canot be used in checkRuleset in nixos use ifname instead
- a way to log only valid ssh credentials logins?

- The connection tracking system supports accounting, which means counting packets and bytes for each flow and for each flow direction. This feature is deactivated by default. You can activate it with this sysctl:
sysctl -w net.netfilter.nf_conntrack_acct=1
conntrack -L

- #iif $if_in oif $if_out accept comment "only from all clients in internal to internet"
- add per src_ip network counters like ssh or dns
- counter for network traffic per src_ip
- QoS with nftables?
- loadbalancing nexthop
- how can you test the speed of fw?

## how to check rules are correct and working?

```sh
ping -t <target IP> -l 65500 # ping flood

dog -U -n 192.168.100.1 google.de # test udp dns query
dog -T -n 192.168.100.1 google.de # test tcp dns query

ssh 192.168.100.1 # ssh counter and log entry

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
nmap -sN 192.168.100.1 -p22 # counter increase by two null packets
nmap -sF 192.168.100.1 -p22 # not in counter
nmap -sX 192.168.100.1 -p22 # counter increase by two xmas
nmap -sS --scanflags SYNFIN 192.168.100.1 -p22 # URG, ACK, PSH, RST, SYN, and FIN
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
