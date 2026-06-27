# complex RHEL kickstart with un-modeled constructs
text
lang en_US.UTF-8
keyboard us
timezone Europe/Zurich --utc
zerombr
network --bootproto=static --ip=10.0.0.5 --netmask=255.255.255.0 --gateway=10.0.0.1 --device=eth0
network --bootproto=dhcp --device=eth1 --bindto=mac
rootpw --iscrypted $6$abc$def
selinux --enforcing
firewall --enabled --service=ssh
clearpart --all --initlabel
part /boot --fstype=xfs --size=1024
volgroup vg00 pv.01
logvol / --vgname=vg00 --name=root --size=8192
bootloader --location=mbr
module --name=idm --stream=DL1
%packages
@^minimal-environment
vim
-nano
%end
%post
echo configured
%end
%addon com_redhat_kdump --enable --reserve-mb=auto
%end
