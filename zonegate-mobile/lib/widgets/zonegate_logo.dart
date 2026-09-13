import 'package:flutter/material.dart';

class ZoneGateLogo extends StatelessWidget {
  final double size;

  const ZoneGateLogo({super.key, this.size = 90});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/zonegate_logo.png',
      width: size,
      height: size,
    );
  }
}
