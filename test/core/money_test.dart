import 'package:businesspilot/core/utils/money.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Money', () {
    test('parses user input into exact minor units', () {
      expect(Money.tryParse('1,500', 'PKR')!.minor, 150000);
      expect(Money.tryParse('100.50', 'PKR')!.minor, 10050);
      expect(Money.tryParse('Rs 2500', 'PKR')!.minor, 250000);
      expect(Money.tryParse('2.5k', 'PKR')!.minor, 250000);
      expect(Money.tryParse('0.1', 'USD')!.minor, 10);
      expect(Money.tryParse('1500', 'JPY')!.minor, 1500);
    });

    test('rejects invalid or over-precise input', () {
      expect(Money.tryParse('abc', 'PKR'), isNull);
      expect(Money.tryParse('1.005', 'USD'), isNull);
      expect(Money.tryParse('-5', 'PKR'), isNull);
      expect(Money.tryParse('', 'PKR'), isNull);
    });

    test('formats for display', () {
      expect(const Money(250000, 'PKR').format(), 'Rs 2,500');
      expect(const Money(10050, 'PKR').format(), 'Rs 100.50');
      expect(const Money(-320000, 'PKR').format(), '-Rs 3,200');
      expect(const Money(199, 'USD').format(), r'$1.99');
      expect(const Money(1000, 'AED').format(), 'AED 10');
      expect(const Money(150000000, 'PKR').format(compact: true), 'Rs 1.5M');
    });

    test('arithmetic stays in integers and guards currency', () {
      expect((const Money(10, 'PKR') + const Money(5, 'PKR')).minor, 15);
      expect(() => const Money(10, 'PKR') + const Money(5, 'USD'), throwsArgumentError);
      expect(const Money(33333, 'PKR').times(3).minor, 99999);
      expect(const Money(52000, 'PKR').times(2.5).minor, 130000); // 2.5 kg
      expect(const Money(100, 'PKR').times(0.333).minor, 33);
    });

    test('decimal string round-trips', () {
      expect(const Money(10050, 'PKR').toDecimalString(), '100.50');
      expect(Money.tryParse(const Money(10050, 'PKR').toDecimalString(), 'PKR')!.minor, 10050);
      expect(const Money(1500, 'JPY').toDecimalString(), '1500');
    });
  });
}
