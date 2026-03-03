import { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  CheckCircle2, Edit2, User, Phone, Mail, CreditCard,
  Calendar, FileText, Shield, ChevronRight,
} from 'lucide-react';

interface PersonalDetailsData {
  fullName: string;
  phoneNumber: string;
  email: string;
  accountType: string;
}

interface CNICData {
  cnicNumber: string;
  fullName: string;
  fatherName: string;
  dateOfBirth: string;
  dateOfIssuance: string;
  dateOfExpiry: string;
  imageUrl?: string;
}

interface ConfirmationStepProps {
  personalData: PersonalDetailsData;
  cnicData: CNICData;
  onConfirm: () => void;
}

// A single display/edit field row
function FieldRow({
  icon,
  label,
  value,
  editing,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      {editing ? (
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-11 rounded-xl border-gray-200 focus:border-[#aa2771] focus:ring-[#aa2771]/20"
        />
      ) : (
        <p className="text-sm text-gray-800 bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 font-medium">
          {value || '—'}
        </p>
      )}
    </div>
  );
}

export function ConfirmationStep({
  personalData,
  cnicData,
  onConfirm,
}: ConfirmationStepProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [personal, setPersonal] = useState({ ...personalData });
  const [cnic, setCnic] = useState({ ...cnicData });

  const handleSave = () => setIsEditing(false);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* ── Top heading ── */}
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-[#aa2771] to-[#8a1f5c] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-gray-800">Review Your Details</h3>
        <p className="text-sm text-gray-500 mt-1">
          Please check all information below before confirming your account opening.
        </p>
      </div>

      {/* ── Card: Personal Details ── */}
      <Card className="p-6 bg-white shadow-sm rounded-2xl border border-gray-100">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#aa2771]/10 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-[#aa2771]" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-gray-800">Personal Details</h4>
              <p className="text-xs text-gray-400">Collected during chat</p>
            </div>
          </div>
          <Button
            onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
            variant="outline"
            size="sm"
            className="rounded-lg border-[#aa2771]/30 text-[#aa2771] hover:bg-[#aa2771]/5 text-xs"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            {isEditing ? 'Save' : 'Edit'}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow
            icon={<User className="w-3.5 h-3.5" />}
            label="Full Name"
            value={personal.fullName}
            editing={isEditing}
            onChange={v => setPersonal(p => ({ ...p, fullName: v }))}
          />
          <FieldRow
            icon={<Phone className="w-3.5 h-3.5" />}
            label="Phone Number"
            value={personal.phoneNumber}
            editing={isEditing}
            onChange={v => setPersonal(p => ({ ...p, phoneNumber: v }))}
          />
          <FieldRow
            icon={<Mail className="w-3.5 h-3.5" />}
            label="Email Address"
            value={personal.email}
            editing={isEditing}
            onChange={v => setPersonal(p => ({ ...p, email: v }))}
          />
          <FieldRow
            icon={<CreditCard className="w-3.5 h-3.5" />}
            label="Account Type"
            value={personal.accountType}
            editing={isEditing}
            onChange={v => setPersonal(p => ({ ...p, accountType: v }))}
          />
        </div>
      </Card>

      {/* ── Card: CNIC Details ── */}
      <Card className="p-6 bg-white shadow-sm rounded-2xl border border-gray-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-gray-800">CNIC Details</h4>
            <p className="text-xs text-gray-400">Extracted from your identity document</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow
            icon={<CreditCard className="w-3.5 h-3.5" />}
            label="CNIC Number"
            value={cnic.cnicNumber}
            editing={false}
            onChange={() => { }}
          />
          <FieldRow
            icon={<User className="w-3.5 h-3.5" />}
            label="Full Name (CNIC)"
            value={cnic.fullName}
            editing={false}
            onChange={() => { }}
          />
          <FieldRow
            icon={<User className="w-3.5 h-3.5" />}
            label="Father's Name"
            value={cnic.fatherName}
            editing={false}
            onChange={() => { }}
          />
          <FieldRow
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Date of Birth"
            value={cnic.dateOfBirth}
            editing={false}
            onChange={() => { }}
          />
          <FieldRow
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Date of Issuance"
            value={cnic.dateOfIssuance}
            editing={false}
            onChange={() => { }}
          />
          <FieldRow
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Date of Expiry"
            value={cnic.dateOfExpiry}
            editing={false}
            onChange={() => { }}
          />
        </div>
      </Card>

      {/* ── Verification Badges ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          'Personal Details ✓',
          'CNIC Verified ✓',
          'Face Matched ✓',
          'Fingerprint ✓',
        ].map(item => (
          <div
            key={item}
            className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-xl"
          >
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-xs text-green-800 font-medium">{item}</span>
          </div>
        ))}
      </div>

      {/* ── Privacy Notice ── */}
      <Card className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
        <div className="flex gap-3 items-start">
          <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            By confirming, you declare that all the information provided is accurate and complete.
            Your data is encrypted and stored securely in compliance with data protection regulations.
          </p>
        </div>
      </Card>

      {/* ── Edit / Confirm Buttons ── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          onClick={() => setIsEditing(e => !e)}
          variant="outline"
          className="flex-1 h-14 border-2 border-gray-200 rounded-2xl text-base hover:bg-gray-50"
        >
          <Edit2 className="w-5 h-5 mr-2 text-gray-500" />
          {isEditing ? 'Cancel Edit' : 'Edit Details'}
        </Button>
        <Button
          onClick={onConfirm}
          className="flex-1 h-14 bg-[#aa2771] hover:bg-[#8a1f5c] text-white rounded-2xl text-base font-semibold shadow-lg"
        >
          <ChevronRight className="w-5 h-5 mr-2" />
          Confirm & Open Account
        </Button>
      </div>
    </div>
  );
}
