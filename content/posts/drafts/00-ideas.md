# ideas

```sh
  https://www.reactivated.net/writing_udev_rules.html

  udevadm info -a -p /sys/class/net/enp10s0 # get all attrs
  #   services.udev.extraRules = ''
  #    KERNEL=="enp*", ATTR{address}=="70:85:c2:89:be:b6", ACTION=="add", SUBSYSTEM=="net",  SYMLINK+="eth0"
  #   '';

# wireguard debbuging

# modprobe wireguard
# echo module wireguard +p > /sys/kernel/debug/dynamic_debug/contro
# dmesg -wT | grep wireguard

# ip route get 192.168.110.1

# No peer has allowed IPs matching 239.255.255.250
# No peer has allowed IPs matching 224.0.0.251
# No peer has allowed IPs matching 224.0.0.22

# strace -e trace=network ping 192.168.110.1
# connect(5, {sa_family=AF_INET, sin_port=htons(1025), sin_addr=inet_addr("192.168.110.1")}, 16) = 0
# getsockname(5, {sa_family=AF_INET, sin_port=htons(37663), sin_addr=inet_addr("192.168.100.21")}, [16]) = 0

# dont use different subnets on one interface in wireguard. the os will select the first ip address on this interface.
# if you want it either, set a defined route with a src ip
# ip route del 192.168.110.0/24 dev wg0
# ip route add 192.168.110.0/24 src 192.168.110.21 dev wg0

# or add a seperate routing table (rt_table) via networking.wireguard.interfaces.<name>.table
```

## private ca on nixos

```sh
    ## crate a private ca

    # enable in nix
    security.pki.certificates = meta.fn.cacert;
    # or
    security.pki.certificateFiles = [ "/pathto/cert.pem" ];

    ## only openssl
    # ca:
    openssl genrsa -out rootCA.key 4096
    openssl req -x509 -new -nodes -key rootCA.key -sha256 -days 3650 -out rootCA.crt

    # server certificate and key
    # key
    openssl genrsa -out hostname.key 4096
    # request
    openssl req -new -sha256 -key hostname.key -subj "/O=hostou, Inc./CN=hostname.local" -out hostname.csr
    # verify request
    openssl req -in hostname.csr -noout -text
    # generate cert
    openssl x509 -req -in hostname.csr -CA rootCA.crt -CAkey rootCA.key -CAcreateserial -out hostname.crt -days 3650 -sha256
    # verify cert
    openssl x509 -in mydomain.com.crt -text -noout
    openssl verify -verbose -CAfile rootCA.crt hostname.crt

    ## authentication
    # grafana not have user provisioning, but you can set with
    # services.grafana.settings.security.admin_password a password.
    # this will leaked in the /nix/store.
    # prometheus nginx grafana basic auth
    nix-shell -p apacheHttpd
    htpasswd -c .htpasswd admin
    basic auth sens on every request the auth. its not optimal but better than nothing. use OAuth instead.

    ## check ssl
    nix-shell -p sslscan
    sslscan hostname.local:8010

    ## check nginx
    curl -sI https://hostname.local:8010 # try to get version
    curl -sI https://hostname.local:8010 -v --http1.1 # http1.1 get
    curl -sI https://hostname.local:8010 -v --http2 # http2 get

    ## system scan
    nix-shell -p lynis
    lynis audit system

    # check tls
    ./tls-scan -c search.yahoo.com --all --pretty
    sslmap
    sslscan/2  nix-shell -p sslscan
    tslx
```

## coreboot

same hardware: guide: https://protectli.com/wp-content/uploads/2020/11/coreboot-building-guide.pdf
https://flashrom.org/Board_Testing_HOWTO
https://forum.opnsense.org/index.php?topic=20315.0
https://doc.coreboot.org/flash_tutorial/index.html
https://www.linux-magazin.de/ausgaben/2018/07/coreboot/
