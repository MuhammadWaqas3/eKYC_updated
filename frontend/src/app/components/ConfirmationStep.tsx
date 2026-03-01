import { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { CheckCircle2, Edit2, User, Phone, Mail, CreditCard, Calendar, FileText } from 'lucide-react';

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

export function ConfirmationStep({ personalData, cnicData, onConfirm }: ConfirmationStepProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editablePersonalData, setEditablePersonalData] = useState(personalData);
  const [editableCnicData, setEditableCnicData] = useState(cnicData);

  const handleSaveEdits = () => {
    setIsEditing(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-[#A8D5BA] to-[#7CB899] rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-2xl font-semibold text-gray-800 mb-2">Confirmation</h3>
        <p className="text-sm text-gray-600">Review your information before submitting</p>
      </div>

      <div className="space-y-6">
        {/* Personal Details Section */}
        <Card className="p-8 bg-white shadow-lg rounded-3xl border-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#A8D5BA]/20 rounded-xl flex items-center justify-center">
                <User className="w-6 h-6 text-[#A8D5BA]" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-gray-800">Personal Details</h4>
                <p className="text-xs text-gray-500">Information from chatbot</p>
              </div>
            </div>
            <Button
              onClick={() => setIsEditing(!isEditing)}
              variant="outline"
              size="sm"
              className="rounded-lg border-[#A8D5BA] text-[#A8D5BA] hover:bg-[#A8D5BA]/10"
            >
              <Edit2 className="w-4 h-4 mr-2" />
              {isEditing ? 'Cancel' : 'Edit'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                Full Name
              </Label>
              {isEditing ? (
                <Input
                  value={editablePersonalData.fullName}
                  onChange={(e) => setEditablePersonalData({ ...editablePersonalData, fullName: e.target.value })}
                  className="h-12 rounded-xl border-gray-200"
                />
              ) : (
                <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editablePersonalData.fullName}</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                Phone Number
              </Label>
              {isEditing ? (
                <Input
                  value={editablePersonalData.phoneNumber}
                  onChange={(e) => setEditablePersonalData({ ...editablePersonalData, phoneNumber: e.target.value })}
                  className="h-12 rounded-xl border-gray-200"
                />
              ) : (
                <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editablePersonalData.phoneNumber}</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                Email Address
              </Label>
              {isEditing ? (
                <Input
                  value={editablePersonalData.email}
                  onChange={(e) => setEditablePersonalData({ ...editablePersonalData, email: e.target.value })}
                  className="h-12 rounded-xl border-gray-200"
                />
              ) : (
                <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editablePersonalData.email}</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-400" />
                Account Type
              </Label>
              {isEditing ? (
                <Input
                  value={editablePersonalData.accountType}
                  onChange={(e) => setEditablePersonalData({ ...editablePersonalData, accountType: e.target.value })}
                  className="h-12 rounded-xl border-gray-200"
                />
              ) : (
                <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editablePersonalData.accountType}</p>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="mt-6">
              <Button
                onClick={handleSaveEdits}
                className="h-12 px-8 bg-[#A8D5BA] hover:bg-[#7CB899] text-white rounded-xl"
              >
                Save Changes
              </Button>
            </div>
          )}
        </Card>

        {/* CNIC Details Section */}
        <Card className="p-8 bg-white shadow-lg rounded-3xl border-0">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#A8D5BA]/20 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-[#A8D5BA]" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-800">CNIC Details</h4>
              <p className="text-xs text-gray-500">Extracted from document</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-400" />
                CNIC Number
              </Label>
              <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editableCnicData.cnicNumber}</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                Full Name
              </Label>
              <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editableCnicData.fullName}</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                Father Name
              </Label>
              <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editableCnicData.fatherName}</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                Date of Birth
              </Label>
              <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editableCnicData.dateOfBirth}</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                Date of Issuance
              </Label>
              <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editableCnicData.dateOfIssuance}</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                Date of Expiry
              </Label>
              <p className="text-base text-gray-800 bg-[#FAFAFA] p-3 rounded-xl">{editableCnicData.dateOfExpiry}</p>
            </div>
          </div>
        </Card>

        {/* Verification Summary */}
        <Card className="p-6 bg-gradient-to-br from-[#A8D5BA]/10 to-[#7CB899]/5 rounded-3xl border border-[#A8D5BA]/30">
          <h4 className="text-base font-semibold text-gray-800 mb-4">Verification Checks Completed</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 p-3 bg-white rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-[#A8D5BA]" />
              <span className="text-sm text-gray-700">Personal Details</span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-white rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-[#A8D5BA]" />
              <span className="text-sm text-gray-700">CNIC Verified</span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-white rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-[#A8D5BA]" />
              <span className="text-sm text-gray-700">Face Matched</span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-white rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-[#A8D5BA]" />
              <span className="text-sm text-gray-700">Fingerprint Captured</span>
            </div>
          </div>
        </Card>

        {/* Confirmation Button */}
        <div className="flex gap-4">
          <Button
            onClick={handleConfirm}
            className="flex-1 h-16 bg-[#A8D5BA] hover:bg-[#7CB899] text-white rounded-2xl shadow-lg text-lg"
          >
            <CheckCircle2 className="w-6 h-6 mr-2" />
            Confirm & Submit
          </Button>
        </div>

        {/* Privacy Notice */}
        <Card className="p-5 bg-[#FFF5F8] border border-[#FFD6E5] rounded-2xl">
          <p className="text-sm text-gray-700 text-center">
            🔒 By submitting, you agree that all information provided is accurate and complete. 
            Your data is encrypted and stored securely in compliance with data protection regulations.
          </p>
        </Card>
      </div>
    </div>
  );
}
