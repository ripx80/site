# ideas

```sh
  https://www.reactivated.net/writing_udev_rules.html

  udevadm info -a -p /sys/class/net/enp10s0 # get all attrs
  #   services.udev.extraRules = ''
  #    KERNEL=="enp*", ATTR{address}=="70:85:c2:89:be:b6", ACTION=="add", SUBSYSTEM=="net",  SYMLINK+="eth0"
  #   '';
*/
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
