import Image from "next/image";


const Header = ({src,alt,title,children}) => {
    return (
        <header className="w-full h-20 flex items-center gap-4">
            <div className="flex items-center gap-3">
                <Image
                    src={src}
                    alt={alt}
                    width={30}
                    height={30}
                />
                <p className="text-lg font-semibold">{title}</p>
            </div>

            <span className="flex-1 border-t border-gray-200"></span>

            <div className="flex gap-2">
                 {children} {/*// buttons */}
            </div>
        </header>
    );
};
export default Header;
